"""Build the startup font. Run: uv run --with fonttools --with brotli python scripts/prepare-webfont.py"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "third_party/fonts/GenSenRounded2PJP-M.otf"
TARGET = ROOT / "ui/fonts/GenSenRounded2PJP-M.woff2"


def required_characters():
    # Keep common Chinese for player names and cloud explanations, plus every
    # literal used by the shipped UI and curriculum. Other text uses system fonts.
    characters = set(range(0x20, 0x100))
    for lead in range(0xA1, 0xF8):
        for trail in range(0xA1, 0xFF):
            try:
                characters.update(map(ord, bytes([lead, trail]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    for start, end in [(0x2000, 0x2070), (0x3000, 0x3040), (0xFF00, 0xFFF0)]:
        characters.update(range(start, end))
    paths = list(ROOT.glob("*.ts*")) + [ROOT / "index.css", ROOT / "index.html"]
    for directory in ["agent", "components", "core", "domains", "hooks", "services", "shared", "ui", "utils", "worker"]:
        paths.extend((ROOT / directory).rglob("*.ts*"))
    for path in paths:
        characters.update(map(ord, path.read_text(encoding="utf-8")))
    return characters


def main():
    font = TTFont(SOURCE, recalcTimestamp=False)
    original_map = font.getBestCmap()
    expected = required_characters() & original_map.keys()
    advances = {codepoint: font["hmtx"][original_map[codepoint]][0] for codepoint in expected}
    options = subset.Options()
    options.name_IDs = ["*"]  # Retain attribution and licensing metadata.
    options.name_languages = ["*"]
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=expected)
    subsetter.subset(font)
    font.flavor = "woff2"
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    font.save(TARGET)
    compact = TTFont(TARGET)
    cmap = compact.getBestCmap()
    assert expected <= cmap.keys(), "A requested character was lost"
    assert all(compact["hmtx"][cmap[codepoint]][0] == advance for codepoint, advance in advances.items()), "Glyph widths changed"
    assert TARGET.stat().st_size < 3_000_000, "Font exceeds startup download budget"
    print(f"Webfont: {len(cmap)} characters, {SOURCE.stat().st_size:,} -> {TARGET.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
