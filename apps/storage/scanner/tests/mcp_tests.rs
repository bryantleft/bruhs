//! Real stdio client against the shipped binary, including filesystem evidence and APFS estimates.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::{symlink, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use serde_json::{json, Value};
use storage_scanner::cleanup;
use storage_scanner::frees;

struct Fixture(PathBuf);
impl Fixture {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!("pith-mcp-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path.canonicalize().unwrap())
    }
    fn write(&self, relative: &str, bytes: usize) -> PathBuf {
        let path = self.0.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, vec![relative.len() as u8; bytes]).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
        let _ = fs::remove_dir_all(self.0.with_extension("reports"));
    }
}

struct Client {
    child: Child,
    input: Option<ChildStdin>,
    output: Receiver<Value>,
}
impl Client {
    fn new(root: &Path) -> Self {
        Self::with_home(root, root)
    }
    fn with_home(root: &Path, home: &Path) -> Self {
        Self::with_cache(root, home, &root.with_extension("reports"))
    }
    fn with_cache(root: &Path, home: &Path, cache: &Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_storage-scanner"))
            .args(["mcp", "--root"])
            .arg(root)
            .env("HOME", home)
            .env("PITH_MCP_REPORTS", cache)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, output) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let reply = serde_json::from_str(&line).unwrap_or_else(|error| {
                    panic!("MCP stdout must contain only JSON: {line}: {error}")
                });
                if tx.send(reply).is_err() {
                    break;
                }
            }
        });
        Self {
            child,
            input: Some(input),
            output,
        }
    }
    fn send(&mut self, request: Value) {
        self.raw(&request.to_string());
    }
    fn raw(&mut self, text: &str) {
        let input = self.input.as_mut().unwrap();
        writeln!(input, "{text}").unwrap();
        input.flush().unwrap();
    }
    fn receive(&self) -> Value {
        // These fixtures contain kilobytes; 30 seconds accommodates CI scheduling and fails a hung pipe or TCC wait.
        self.output
            .recv_timeout(Duration::from_secs(30))
            .expect("the MCP server must answer")
    }
    fn init(&mut self) {
        self.send(json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-11-25", "clientInfo": { "name": "test", "version": "1" }, "capabilities": {} } }));
        assert_eq!(self.receive()["result"]["protocolVersion"], "2025-11-25");
        self.send(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
    }
    fn call_response(&mut self, name: &str, arguments: Value) -> Value {
        self.send(json!({ "jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": { "name": name, "arguments": arguments } }));
        let reply = self.receive();
        assert_eq!(reply["id"], 7);
        reply
    }
    fn call(&mut self, name: &str, arguments: Value) -> Value {
        self.call_response(name, arguments)["result"].clone()
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn scan_ranks_evidence_before_size_and_inspection_does_not_replace_it() {
    let fixture = Fixture::new("recommendations");
    fixture.write("Library/Caches/editor/cache.bin", 8192);
    fixture.write("project/package.json", 2);
    fixture.write("project/node_modules/package/index.js", 4096);
    fixture.write("Documents/important.mov", 32768);
    fixture.write("Documents/target/personal.txt", 4096);
    fixture.write("project/.git/objects/private", 4096);
    fixture.write(".ssh/key", 4096);
    fixture.write("Library/Application Support/app/database", 16384);
    fixture.write("Downloads/Installer.dmg", 4096);
    let mut client = Client::new(&fixture.0);
    client.init();
    assert_eq!(
        client.call("pith_cleanup_candidates", json!({}))["isError"],
        true
    );
    let scan = client.call("pith_scan", json!({}));
    assert_eq!(scan["isError"], false, "{scan}");
    assert_eq!(scan["structuredContent"]["root"], json!(fixture.0));
    let scan_id = scan["structuredContent"]["scan_id"].as_str().unwrap();
    let report = client.call("pith_cleanup_candidates", json!({"scan_id": scan_id}))
        ["structuredContent"]
        .clone();
    let all = report["candidates"].as_array().unwrap();
    assert!(all.len() >= 5);
    assert_eq!(
        all[0]["risk"], "rebuildable",
        "a bigger personal file must not outrank rebuildable data"
    );
    let cache = all
        .iter()
        .find(|candidate| candidate["category"] == "cache")
        .unwrap();
    assert_eq!(
        cache["path"],
        json!(fixture.0.join("Library/Caches/editor"))
    );
    assert_eq!(
        cache["allocatedBytes"],
        json!(
            fs::metadata(fixture.0.join("Library/Caches/editor/cache.bin"))
                .unwrap()
                .blocks()
                * 512
        )
    );
    let dependency = all
        .iter()
        .find(|candidate| candidate["category"] == "build_output")
        .unwrap();
    assert_eq!(
        dependency["path"],
        json!(fixture.0.join("project/node_modules"))
    );
    assert!(!all
        .iter()
        .any(|candidate| candidate["path"].as_str().unwrap().contains(".git/")));
    assert!(!all
        .iter()
        .any(|candidate| candidate["path"].as_str().unwrap().contains(".ssh/")));
    assert!(!all.iter().any(|candidate| candidate["path"]
        .as_str()
        .unwrap()
        .contains("Application Support/")));
    assert!(all.iter().any(|candidate| candidate["path"]
        == json!(fixture.0.join("Documents/target/personal.txt"))
        && candidate["risk"] == "review"));
    for (i, candidate) in all.iter().enumerate() {
        for other in &all[i + 1..] {
            let path = Path::new(candidate["path"].as_str().unwrap());
            let other = Path::new(other["path"].as_str().unwrap());
            assert!(
                !path.starts_with(other) && !other.starts_with(path),
                "candidates must not overlap"
            );
        }
    }
    let inspected = client.call("pith_inspect_path", json!({ "path": "project" }));
    assert_eq!(inspected["isError"], false);
    assert_eq!(
        client.call("pith_cleanup_candidates", json!({"scan_id": scan_id}))["structuredContent"]
            ["root"],
        json!(fixture.0)
    );
    let first = client.call(
        "pith_cleanup_candidates",
        json!({ "scan_id": scan_id, "limit": 1 }),
    );
    assert_eq!(first["structuredContent"]["nextOffset"], 1);
    assert_eq!(
        client.call(
            "pith_cleanup_candidates",
            json!({ "scan_id": scan_id, "offset": 1, "limit": 1 })
        )["structuredContent"]["candidates"][0],
        all[1]
    );
    assert_eq!(
        client.call(
            "pith_cleanup_candidates",
            json!({ "scan_id": scan_id, "limit": 0 })
        )["isError"],
        true
    );
    assert_eq!(
        client.call(
            "pith_cleanup_candidates",
            json!({ "scan_id": scan_id, "limit": 101 })
        )["isError"],
        true
    );
    assert_eq!(
        client.call(
            "pith_cleanup_candidates",
            json!({ "scan_id": scan_id, "offset": usize::MAX })
        )["isError"],
        true
    );
    fixture.write("new-after-scan", 4096);
    assert_eq!(
        client.call("pith_cleanup_candidates", json!({"scan_id": scan_id}))["structuredContent"],
        report,
        "saved evidence is not silently refreshed"
    );
    assert!(fixture.0.join("Documents/important.mov").exists());
}

#[test]
fn estimate_deduplicates_nested_paths_and_respects_shared_blocks() {
    let fixture = Fixture::new("estimate");
    let file = fixture.write("selected/file", 16384);
    fs::hard_link(&file, fixture.0.join("link-outside-selection")).unwrap();
    let other = fixture.write("selected/unique", 8192);
    let expected = frees::measure(&[fixture.0.join("selected")]);
    let mut client = Client::new(&fixture.0);
    client.init();
    let estimate = client.call(
        "pith_estimate_cleanup",
        json!({ "paths": ["selected/file", "selected", "selected/unique", "selected"] }),
    );
    assert_eq!(estimate["isError"], false, "{estimate}");
    assert_eq!(estimate["structuredContent"]["bytes"], expected.bytes);
    assert_eq!(
        estimate["structuredContent"]["shared"],
        fs::metadata(&file).unwrap().blocks() * 512
    );
    assert_eq!(estimate["structuredContent"]["files"], 2);
    assert!(
        file.exists() && other.exists(),
        "the MCP connection never moves or deletes files"
    );
    let inspected = client.call("pith_inspect_path", json!({ "path": "selected/file" }));
    assert_eq!(inspected["structuredContent"]["hardLinks"], 2);
    assert_eq!(inspected["structuredContent"]["logicalBytes"], 16384);
}

#[test]
fn paths_cannot_escape_the_configured_scope_and_arguments_are_validated() {
    let fixture = Fixture::new("scope");
    let outside = Fixture::new("scope-other");
    outside.write("secret", 4096);
    symlink(&outside.0, fixture.0.join("escape")).unwrap();
    let mut client = Client::new(&fixture.0);
    client.init();
    for path in [
        outside.0.to_string_lossy().to_string(),
        "escape/secret".into(),
        "../".into(),
        "missing".into(),
        "bad\0path".into(),
    ] {
        assert_eq!(
            client.call("pith_scan", json!({ "path": path }))["isError"],
            true
        );
        assert_eq!(
            client.call("pith_inspect_path", json!({ "path": path }))["isError"],
            true
        );
        assert_eq!(
            client.call("pith_estimate_cleanup", json!({ "paths": [path] }))["isError"],
            true
        );
    }
    assert_eq!(
        client.call("pith_scan", json!({ "path": 0 }))["isError"],
        true
    );
    assert_eq!(
        client.call("pith_scan", json!({ "path": null }))["isError"],
        true
    );
    assert_eq!(client.call("pith_inspect_path", json!({}))["isError"], true);
    assert_eq!(
        client.call("pith_status", json!({ "shell": "rm -rf /" }))["isError"],
        true
    );
    assert_eq!(
        client.call("pith_estimate_cleanup", json!({ "paths": [] }))["isError"],
        true
    );
    assert_eq!(
        client.call("pith_estimate_cleanup", json!({ "paths": vec!["."; 33] }))["isError"],
        true
    );
    assert_eq!(
        client.call_response("pith_trash", json!({ "path": "." }))["error"]["code"],
        -32602
    );
}

#[test]
fn protocol_supports_legacy_and_modern_clients_and_recovers_from_bad_input() {
    let fixture = Fixture::new("protocol");
    let mut client = Client::new(&fixture.0);
    client.raw("{");
    assert_eq!(client.receive()["error"]["code"], -32700);
    client.raw("[]");
    assert_eq!(client.receive()["error"]["code"], -32600);
    client.send(json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }));
    assert_eq!(client.receive()["error"]["code"], -32602);
    let meta = json!({ "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} });
    client.send(json!({ "jsonrpc": "2.0", "id": "discover", "method": "server/discover", "params": { "_meta": meta } }));
    let discovered = client.receive();
    assert_eq!(discovered["result"]["supportedVersions"][0], "2026-07-28");
    assert_eq!(discovered["result"]["resultType"], "complete");
    client.send(json!({ "jsonrpc": "2.0", "id": "modern", "method": "tools/list", "params": { "_meta": meta } }));
    let tools = client.receive();
    assert_eq!(tools["id"], "modern");
    let tools = tools["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 5);
    assert!(tools
        .iter()
        .all(|tool| tool["annotations"]["readOnlyHint"] == true
            && tool["annotations"]["destructiveHint"] == false));
    client.send(json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": { "_meta": { "io.modelcontextprotocol/protocolVersion": "1900-01-01", "io.modelcontextprotocol/clientCapabilities": {} } } }));
    assert_eq!(client.receive()["error"]["code"], -32022);
    client.init();
    assert_eq!(
        client.call("pith_status", json!({}))["structuredContent"]["readOnly"],
        true
    );
    client.send(json!({ "jsonrpc": "2.0", "id": 4, "method": "no-such-method" }));
    assert_eq!(client.receive()["error"]["code"], -32601);
    client.input.take();
    assert!(
        client.child.wait().unwrap().success(),
        "stdin EOF must shut down the server"
    );
}

#[test]
fn explicit_scan_ids_survive_reconnects_and_cannot_cross_configured_scopes() {
    let fixture = Fixture::new("reconnect");
    fixture.write("first/Cargo.toml", 10);
    fixture.write("first/target/output", 4096);
    fixture.write("second/package.json", 10);
    fixture.write("second/node_modules/output", 8192);
    let first_id;
    let second_id;
    {
        let mut client = Client::new(&fixture.0);
        client.init();
        first_id = client.call("pith_scan", json!({"path":"first"}))["structuredContent"]
            ["scan_id"]
            .as_str()
            .unwrap()
            .to_string();
        second_id = client.call("pith_scan", json!({"path":"second"}))["structuredContent"]
            ["scan_id"]
            .as_str()
            .unwrap()
            .to_string();
        assert_ne!(first_id, second_id);
    }
    let mut reconnected = Client::new(&fixture.0);
    reconnected.init();
    let first = reconnected.call("pith_cleanup_candidates", json!({"scan_id":first_id}));
    let second = reconnected.call("pith_cleanup_candidates", json!({"scan_id":second_id}));
    assert_eq!(
        first["structuredContent"]["root"],
        json!(fixture.0.join("first"))
    );
    assert_eq!(
        second["structuredContent"]["root"],
        json!(fixture.0.join("second"))
    );
    assert_eq!(first["structuredContent"]["scan_id"], first_id);
    assert_eq!(second["structuredContent"]["scan_id"], second_id);
    assert_eq!(
        reconnected.call("pith_cleanup_candidates", json!({}))["isError"],
        true,
        "a last-scan fallback is forbidden"
    );
    let mut narrower = Client::with_cache(
        &fixture.0.join("first"),
        &fixture.0,
        &fixture.0.with_extension("reports"),
    );
    narrower.init();
    let denied = narrower.call("pith_cleanup_candidates", json!({"scan_id":first_id}));
    assert_eq!(denied["isError"], true);
    assert!(denied["structuredContent"]["error"]
        .as_str()
        .unwrap()
        .contains("scope"));
}

#[test]
fn modern_wire_requires_metadata_valid_envelopes_and_cacheable_results() {
    let fixture = Fixture::new("modern-wire");
    let mut client = Client::new(&fixture.0);
    let meta = json!({"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}});
    client.raw("{");
    let invalid = client.receive();
    assert_eq!(invalid["error"]["code"], -32700);
    assert!(
        invalid.get("id").is_none(),
        "modern uncorrelatable errors omit id rather than id:null"
    );
    for request in [
        json!({"jsonrpc":"1.0","id":42,"method":"ping"}),
        json!({"jsonrpc":"2.0","id":"readable","method":7}),
    ] {
        client.send(request.clone());
        let reply = client.receive();
        assert_eq!(reply["error"]["code"], -32600);
        assert_eq!(
            reply["id"], request["id"],
            "Readable request IDs must survive envelope errors"
        );
    }
    client.send(json!({"jsonrpc":"2.0","id":[],"method":"ping"}));
    assert!(client.receive().get("id").is_none());
    for bad in [
        json!({}),
        json!({"_meta":[]}),
        json!({"_meta": {"io.modelcontextprotocol/protocolVersion":1,"io.modelcontextprotocol/clientCapabilities":{}}}),
        json!({"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}),
    ] {
        client.send(json!({"jsonrpc":"2.0","id":2,"method":"server/discover","params":bad}));
        assert_eq!(client.receive()["error"]["code"], -32602);
    }
    for method in ["server/discover", "tools/list"] {
        client.send(json!({"jsonrpc":"2.0","id":3,"method":method,"params":{"_meta":meta}}));
        let result = client.receive()["result"].clone();
        assert_eq!(result["resultType"], "complete");
        assert_eq!(result["ttlMs"], 0);
        assert_eq!(result["cacheScope"], "private");
        assert_eq!(
            result["_meta"]["io.modelcontextprotocol/serverInfo"]["name"],
            "pith"
        );
    }
    for params in [
        json!({"_meta":meta}),
        json!({"name":42,"_meta":meta}),
        json!({"name":"unknown","_meta":meta}),
        json!({"name":"pith_scan","arguments":[],"_meta":meta}),
        json!({"name":"pith_scan","arguments":null,"_meta":meta}),
    ] {
        client.send(json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":params}));
        assert_eq!(client.receive()["error"]["code"], -32602);
    }
    client.send(json!({"jsonrpc":"2.0","id":5,"method":"tools/list","params":{"_meta":meta,"cursor":"never-issued"}}));
    assert_eq!(client.receive()["error"]["code"], -32602);
    client.send(json!({"jsonrpc":"2.0","method":"notifications/unknown","params":{}}));
    client.send(json!({"jsonrpc":"2.0","id":6,"method":"ping","params":{"_meta":meta}}));
    assert_eq!(
        client.receive()["id"],
        6,
        "notifications must never receive responses"
    );
}

#[test]
fn oversized_requests_fail_with_a_bounded_input_budget() {
    let fixture = Fixture::new("input-budget");
    let mut client = Client::new(&fixture.0);
    client.raw(&" ".repeat(64 * 1024));
    assert_eq!(client.receive()["error"]["code"], -32600);
    assert!(client.child.wait().unwrap().success());
}

#[test]
fn unreadable_candidates_have_explicit_coverage_gaps() {
    if unsafe { libc::geteuid() } == 0 {
        return;
    }
    let fixture = Fixture::new("coverage");
    fixture.write("Library/Caches/app/readable", 4096);
    fixture.write("Library/Caches/app/denied/file", 4096);
    let denied = fixture.0.join("Library/Caches/app/denied");
    fs::set_permissions(&denied, fs::Permissions::from_mode(0o000)).unwrap();
    let report = cleanup::scan(&fixture.0, &fixture.0);
    // Restore permission before any assertion, so a failed assertion still leaves a removable fixture.
    fs::set_permissions(&denied, fs::Permissions::from_mode(0o700)).unwrap();
    let report = report.unwrap();
    assert_eq!(report.summary.unreadable.denied, 1);
    assert_eq!(report.candidates[0].unreadable_folders, 1);
}

#[test]
fn home_aliases_preserve_cache_and_credential_classification() {
    let fixture = Fixture::new("home-alias");
    fixture.write("Library/Caches/editor/cache", 4096);
    fixture.write("Library/Keychains/login.keychain-db", 8192);
    let alias = fixture.0.join("home-alias");
    symlink(&fixture.0, &alias).unwrap();
    let mut client = Client::with_home(&fixture.0, &alias);
    client.init();
    let scan = client.call("pith_scan", json!({}));
    assert_eq!(scan["isError"], false);
    let result = client.call(
        "pith_cleanup_candidates",
        json!({"scan_id": scan["structuredContent"]["scan_id"]}),
    );
    let candidates = result["structuredContent"]["candidates"]
        .as_array()
        .unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0]["category"], "cache");
    let output = Command::new(env!("CARGO_BIN_EXE_storage-scanner"))
        .args(["analyze", "--root"])
        .arg(&alias)
        .env("HOME", &alias)
        .output()
        .unwrap();
    assert!(output.status.success());
    let report: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["candidates"].as_array().unwrap().len(), 1);
    assert_eq!(report["candidates"][0]["category"], "cache");
}

#[test]
fn unrelated_absolute_paths_are_rejected_before_their_existence_is_probed() {
    let fixture = Fixture::new("lexical-scope");
    let unrelated = PathBuf::from("/Volumes/pith-does-not-mount-or-probe-this/secret");
    let error = cleanup::resolve(&fixture.0, unrelated.to_str().unwrap()).unwrap_err();
    assert!(error.contains("outside the configured folder"), "{error}");
}

#[test]
fn known_generated_locations_are_distinct_from_archives_devices_and_personal_folders() {
    let fixture = Fixture::new("location-rules");
    for path in [
        "Library/Developer/Xcode/DerivedData/project/build",
        "Library/Developer/Xcode/Archives/release/archive",
        "Library/Developer/CoreSimulator/Devices/device/data",
        "Documents/Caches/personal",
        ".Trash/deleted",
    ] {
        fixture.write(path, 4096);
    }
    let report = cleanup::scan(&fixture.0, &fixture.0).unwrap();
    let candidates = serde_json::to_value(report.candidates).unwrap();
    let candidates = candidates.as_array().unwrap();
    let risk = |category| {
        candidates
            .iter()
            .find(|candidate| candidate["category"] == category)
            .unwrap()["risk"]
            .clone()
    };
    assert_eq!(risk("xcode_derived_data"), "rebuildable");
    assert_eq!(risk("archives"), "managed");
    assert_eq!(risk("simulators"), "managed");
    assert_eq!(risk("trash"), "review");
    assert!(candidates.iter().any(|candidate| candidate["path"]
        == json!(fixture.0.join("Documents/Caches/personal"))
        && candidate["risk"] == "review"));
}

#[test]
fn project_markers_must_be_regular_files_inside_the_scan() {
    let fixture = Fixture::new("marker-scope");
    let outside = Fixture::new("marker-outside");
    let manifest = outside.write("package.json", 2);
    fixture.write("linked/node_modules/package/file", 4096);
    symlink(manifest, fixture.0.join("linked/package.json")).unwrap();
    fixture.write("project/package.json", 2);
    fixture.write("project/node_modules/package/file", 4096);
    let report = cleanup::scan(&fixture.0, &fixture.0).unwrap();
    let generated: Vec<_> = report
        .candidates
        .iter()
        .filter(|candidate| candidate.category == "build_output")
        .collect();
    assert_eq!(generated.len(), 1);
    assert_eq!(
        generated[0].path,
        fixture.0.join("project/node_modules").to_str().unwrap()
    );
    let narrowed = cleanup::scan(&fixture.0.join("project/node_modules"), &fixture.0).unwrap();
    assert!(
        narrowed
            .candidates
            .iter()
            .all(|candidate| candidate.category != "build_output"),
        "a scan may not inspect the manifest above its root"
    );
}

#[test]
fn mcp_estimates_apfs_clones_as_a_set_without_deleting_them() {
    use std::os::unix::ffi::OsStrExt;
    let fixture = Fixture::new("clone-estimate");
    let source = fixture.write("original", 32768);
    let copy = fixture.0.join("copy");
    let source_c = std::ffi::CString::new(source.as_os_str().as_bytes()).unwrap();
    let copy_c = std::ffi::CString::new(copy.as_os_str().as_bytes()).unwrap();
    assert_eq!(
        unsafe { libc::clonefile(source_c.as_ptr(), copy_c.as_ptr(), 0) },
        0,
        "the test volume must support APFS clones"
    );
    let bytes = fs::metadata(&source).unwrap().blocks() * 512;
    let mut client = Client::new(&fixture.0);
    client.init();
    let single = client.call("pith_estimate_cleanup", json!({ "paths": ["original"] }));
    assert_eq!(single["structuredContent"]["bytes"], 0);
    assert_eq!(single["structuredContent"]["shared"], bytes);
    let both = client.call(
        "pith_estimate_cleanup",
        json!({ "paths": ["original", "copy"] }),
    );
    assert_eq!(both["structuredContent"]["bytes"], bytes);
    assert_eq!(both["structuredContent"]["shared"], 0);
    assert!(source.exists() && copy.exists());
}
