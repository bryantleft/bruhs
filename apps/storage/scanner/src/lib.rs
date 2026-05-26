//! Library surface for the storage scanner so integration tests can exercise the
//! traversal and aggregation logic. The binary (`main.rs`) is a thin CLI over this.

pub mod model;
pub mod output;
pub mod trash;
pub mod walk;
