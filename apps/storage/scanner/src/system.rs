//! How the scanner reads: never downloading iCloud files, never writing access times back, and at the priority the
//! work deserves.

const IOPOL_TYPE_DISK: libc::c_int = 0;
const IOPOL_TYPE_VFS_ATIME_UPDATES: libc::c_int = 2;
const IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES: libc::c_int = 3;
const IOPOL_SCOPE_PROCESS: libc::c_int = 0;
const IOPOL_SCOPE_THREAD: libc::c_int = 1;
const IOPOL_DEFAULT: libc::c_int = 0;
const IOPOL_THROTTLE: libc::c_int = 3;
const IOPOL_ATIME_UPDATES_OFF: libc::c_int = 1;
const IOPOL_MATERIALIZE_DATALESS_FILES_OFF: libc::c_int = 1;
/// `qos_class_t` values from `<sys/qos.h>`.
const QOS_CLASS_UTILITY: libc::c_uint = 0x11;
const QOS_CLASS_BACKGROUND: libc::c_uint = 0x09;

extern "C" {
    fn setiopolicy_np(iotype: libc::c_int, scope: libc::c_int, policy: libc::c_int) -> libc::c_int;
    fn pthread_set_qos_class_self_np(qos_class: libc::c_uint, relative_priority: libc::c_int) -> libc::c_int;
    fn malloc_zone_pressure_relief(zone: *mut libc::c_void, goal: libc::size_t) -> libc::size_t;
}

/// Returns memory malloc holds free to macOS, as after a walk, whose listings came and went by the million: without
/// it the process keeps their peak as its footprint.
pub fn return_free_memory() {
    unsafe { malloc_zone_pressure_relief(std::ptr::null_mut(), 0) };
}

/// Reading an iCloud file that isn't downloaded makes macOS download it, and so can reading its attributes when a
/// folder above it isn't downloaded either (Apple TN3150). This process opts out before it reads anything; a scan
/// that can't opt out doesn't run.
pub fn stop_cloud_downloads() -> Result<(), String> {
    let status = unsafe { setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES, IOPOL_SCOPE_PROCESS, IOPOL_MATERIALIZE_DATALESS_FILES_OFF) };
    if status == 0 {
        Ok(())
    } else {
        Err(format!("The scan didn't start: macOS wouldn't let it skip iCloud downloads ({}).", std::io::Error::last_os_error()))
    }
}

/// Listing a folder shouldn't write its access time back: a map kept current all day would otherwise write to every
/// folder it reads. Best effort, since a volume that ignores the setting still reads correctly.
pub fn stop_access_time_updates() {
    unsafe { setiopolicy_np(IOPOL_TYPE_VFS_ATIME_UPDATES, IOPOL_SCOPE_PROCESS, IOPOL_ATIME_UPDATES_OFF) };
}

/// What a folder is listed for, which sets the thread's priority while it's listed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Purpose {
    /// The first walk of a disk, which someone is waiting for: utility, as Apple's energy guide puts work the person
    /// asked for but isn't watching closely.
    Walk,
    /// A folder FSEvents named, or a new folder found in one: background, which keeps it on the efficiency cores and
    /// lowers its disk I/O.
    Relist,
    /// The daily check of every folder: background with throttled disk I/O, so it yields to everything else.
    Check,
}

/// Sets the calling thread's QoS and disk I/O policy for `purpose`. Best effort: a thread that keeps its old
/// priority still lists correctly.
pub fn set_thread_purpose(purpose: Purpose) {
    let (qos, io) = match purpose {
        Purpose::Walk => (QOS_CLASS_UTILITY, IOPOL_DEFAULT),
        Purpose::Relist => (QOS_CLASS_BACKGROUND, IOPOL_DEFAULT),
        Purpose::Check => (QOS_CLASS_BACKGROUND, IOPOL_THROTTLE),
    };
    unsafe {
        pthread_set_qos_class_self_np(qos, 0);
        setiopolicy_np(IOPOL_TYPE_DISK, IOPOL_SCOPE_THREAD, io);
    }
}
