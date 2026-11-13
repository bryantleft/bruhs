//! Library surface for the storage scanner so integration tests can exercise the
//! traversal and aggregation logic. The binary (`main.rs`) is a thin CLI over this.

pub mod cleanup;
pub mod frees;
pub mod index;
pub mod kinds;
pub mod listing;
pub mod model;
pub mod output;
pub mod scheduler;
pub mod serve;
pub mod snapshot;
pub mod system;
pub mod trash;
pub mod volumes;
pub mod walk;
pub mod workers;
