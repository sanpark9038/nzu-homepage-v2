import argparse
from pathlib import Path


def trim_to_tbody(src: Path, dst: Path) -> int:
    text = src.read_text(encoding="utf-8")

    start = text.find("<tbody")
    if start < 0:
        raise ValueError("No <tbody> tag found")

    start_close = text.find(">", start)
    if start_close < 0:
        raise ValueError("Malformed <tbody> opening tag")

    end = text.find("</tbody>", start_close + 1)
    if end < 0:
        raise ValueError("No </tbody> tag found")

    trimmed = text[start : end + len("</tbody>")]
    dst.write_text(trimmed + "\n", encoding="utf-8")
    return len(trimmed.splitlines())


def main():
    parser = argparse.ArgumentParser(description="Trim roster HTML down to first <tbody> block.")
    parser.add_argument("--input", required=True, help="Input HTML path")
    parser.add_argument("--output", help="Output path (default: <input>.tbody.html)")
    args = parser.parse_args()

    src = Path(args.input).resolve()
    if not src.exists():
        raise FileNotFoundError(f"Input not found: {src}")

    if args.output:
        dst = Path(args.output).resolve()
    else:
        dst = src.with_suffix(src.suffix + ".tbody.html")

    lines = trim_to_tbody(src, dst)
    print(f"[*] Trimmed file: {dst}")
    print(f"[*] Preserved lines: {lines}")


if __name__ == "__main__":
    main()
