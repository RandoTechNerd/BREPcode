"""CADGenBench's own validity gate on one STEP; prints one JSON line.

    python -I validity.py candidate.step
"""
import json
import sys

from cadgenbench.common.validity import analyze_step


def main():
    try:
        r = analyze_step(sys.argv[1])
        v, m = r.validation, r.measurements
        print(json.dumps({
            "valid": bool(v.is_valid), "solids": m.solid_count, "faces": m.face_count, "volume": m.volume,
            "errors": [str(e) for e in (getattr(v, "topology_errors", None) or [])][:5],
        }))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"valid": False, "errors": [f"STEP load failed: {e}"]}))


# analyze_step uses multiprocessing (spawn), which re-imports this module
if __name__ == "__main__":
    main()
