//! Threads that list folders for the live index. Work someone is waiting on goes first; the daily check runs on at
//! most `idle_limit` threads at a time, so it never takes the whole Mac.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::listing::{list, Listing};
use crate::system::{set_thread_purpose, Purpose};
use crate::walk::Context;

pub struct Job {
    pub folder: u32,
    pub path: PathBuf,
    pub purpose: Purpose,
    /// List every subfolder again too.
    pub deep: bool,
    /// The index the job was made for: a listing for an index that's since been replaced is dropped.
    pub epoch: u32,
}

pub struct Done {
    pub job: Job,
    pub listing: Listing,
    /// How long the listing took, which sets how soon the folder may be listed again.
    pub cost: Duration,
}

struct Queues {
    /// Taken newest first: during a walk that goes deep before it goes wide, so the folders waiting stay few.
    urgent: Vec<Job>,
    idle: VecDeque<Job>,
    idle_running: usize,
    closed: bool,
}

pub struct Pool {
    shared: Arc<(Mutex<Queues>, Condvar)>,
    threads: Vec<JoinHandle<()>>,
}

impl Pool {
    /// Starts `threads` workers that list folders on the disk `cx` describes and pass each listing to `done`.
    pub fn new(threads: usize, idle_limit: usize, cx: Arc<Context>, done: Arc<dyn Fn(Done) + Send + Sync>) -> Pool {
        let shared = Arc::new((Mutex::new(Queues { urgent: Vec::new(), idle: VecDeque::new(), idle_running: 0, closed: false }), Condvar::new()));
        let threads = (0..threads.max(1))
            .map(|n| {
                let shared = shared.clone();
                let cx = cx.clone();
                let done = done.clone();
                std::thread::Builder::new()
                    .name(format!("lister-{n}"))
                    .spawn(move || work(&shared, idle_limit, &cx, &*done))
                    .expect("a listing thread")
            })
            .collect();
        Pool { shared, threads }
    }

    pub fn submit(&self, job: Job) {
        let (lock, ready) = &*self.shared;
        let mut queues = lock.lock().unwrap();
        if job.purpose == Purpose::Check {
            queues.idle.push_back(job);
        } else {
            queues.urgent.push(job);
        }
        ready.notify_one();
    }

    /// Drops every job not yet started, as when a new walk replaces the index.
    pub fn clear(&self) {
        let (lock, _) = &*self.shared;
        let mut queues = lock.lock().unwrap();
        queues.urgent.clear();
        queues.idle.clear();
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        {
            let (lock, ready) = &*self.shared;
            lock.lock().unwrap().closed = true;
            ready.notify_all();
        }
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}

fn work(shared: &(Mutex<Queues>, Condvar), idle_limit: usize, cx: &Context, done: &(dyn Fn(Done) + Send + Sync)) {
    let (lock, ready) = shared;
    let mut purpose = None;
    loop {
        let (job, idle) = {
            let mut queues = lock.lock().unwrap();
            loop {
                if let Some(job) = queues.urgent.pop() {
                    break (job, false);
                }
                if queues.idle_running < idle_limit {
                    if let Some(job) = queues.idle.pop_front() {
                        queues.idle_running += 1;
                        break (job, true);
                    }
                }
                if queues.closed {
                    return;
                }
                queues = ready.wait(queues).unwrap();
            }
        };
        if purpose != Some(job.purpose) {
            set_thread_purpose(job.purpose);
            purpose = Some(job.purpose);
        }
        let start = Instant::now();
        let listing = list(&job.path, cx);
        let cost = start.elapsed();
        done(Done { job, listing, cost });
        if idle {
            lock.lock().unwrap().idle_running -= 1;
            ready.notify_one();
        }
    }
}
