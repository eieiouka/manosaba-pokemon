# Rust self-play engine

Experimental native port of the offline JavaScript battle simulator and value trainer. The browser battle engine is unchanged. Do not use the trained model for public CPU play until differential parity passes.

From repository root:

```powershell
node scripts/export-rust-data.mjs
cargo build --release --manifest-path rust/Cargo.toml
node scripts/check-rust-parity.mjs 200
cargo run --release --manifest-path rust/Cargo.toml -- --games 1000000 --workers 8 --out analysis/value-rust.json
```

Start with 10,000 games to measure games/s; increase --games to resume from a compatible checkpoint. The checkpoint includes model weights and Adam optimizer state and is written at roughly three-second intervals. The existing JS trainer and its checkpoints remain untouched. Use a different output path when changing rules or training settings.

The engine uses the same 503-element feature layout as the JS value model. This makes its weights readable by the JS offline solver, but the Rust checkpoint itself cannot be resumed by the JS trainer. Compare rules and feature values with the parity script before using the weights in the solver. Capped games are treated as draws with target 0.

The data exporter reads the canonical JS roster and actual level-50 stats. Re-run it after roster edits. Ability effects are implemented in Rust; synchronize rule changes to both engines.
