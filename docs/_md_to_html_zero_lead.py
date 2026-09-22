"""One-off: markdown -> simple printable HTML for ZERO_LEAD_ROOT_CAUSE."""
from pathlib import Path

md = Path(__file__).with_name("ZERO_LEAD_ROOT_CAUSE.md").read_text(encoding="utf-8")
# Escape HTML special chars first in content lines later; keep simple for print.
escaped = (
    md.replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
)
lines_out = []
in_code = False
in_table = False
for line in escaped.splitlines():
    if line.startswith("```"):
        if in_code:
            lines_out.append("</pre>")
            in_code = False
        else:
            lines_out.append("<pre>")
            in_code = True
        continue
    if in_code:
        lines_out.append(line)
        continue
    if line.startswith("|") and "---" not in line.replace("|", "").replace("-", "").replace(" ", ""):
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not in_table:
            lines_out.append("<table>")
            in_table = True
        tag = "th" if not any("<td" in x for x in lines_out[-3:]) and len(lines_out) < 5 else "td"
        # header = first table row after open
        if lines_out[-1] == "<table>":
            tag = "th"
        row = "".join(f"<{tag}>{c}</{tag}>" for c in cells)
        lines_out.append(f"<tr>{row}</tr>")
        continue
    if in_table and not line.startswith("|"):
        lines_out.append("</table>")
        in_table = False
    if line.startswith("|") and set(line.replace("|", "").strip()) <= set("-: "):
        continue
    if line.startswith("# "):
        lines_out.append(f"<h1>{line[2:]}</h1>")
    elif line.startswith("## "):
        lines_out.append(f"<h2>{line[3:]}</h2>")
    elif line.startswith("### "):
        lines_out.append(f"<h3>{line[4:]}</h3>")
    elif line.strip() == "---":
        lines_out.append("<hr>")
    elif line.startswith("- "):
        lines_out.append(f"<li>{line[2:]}</li>")
    elif line.strip() == "":
        lines_out.append("")
    else:
        text = line.replace("**", "<strong>", 1)
        while "**" in text:
            if text.count("**") >= 1:
                text = text.replace("**", "</strong>", 1) if "<strong>" in text and text.find("<strong>") < text.find("**") else text.replace("**", "<strong>", 1)
            else:
                break
        # simpler bold pass
        import re
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line)
        lines_out.append(f"<p>{text}</p>")

if in_table:
    lines_out.append("</table>")
if in_code:
    lines_out.append("</pre>")

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Why Generate Prospects Returns Zero Leads</title>
<style>
body {{ font-family: Georgia, serif; max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.55; color: #111; }}
h1 {{ font-size: 1.65rem; }}
h2 {{ font-size: 1.25rem; margin-top: 1.75rem; border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; }}
h3 {{ font-size: 1.05rem; }}
table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }}
th, td {{ border: 1px solid #bbb; padding: 0.4rem 0.55rem; vertical-align: top; text-align: left; }}
th {{ background: #f3f3f3; }}
pre {{ background: #f5f5f5; padding: 1rem; overflow: auto; font-size: 0.82rem; }}
li {{ margin-left: 1.25rem; }}
@media print {{ body {{ max-width: none; margin: 0.5in; }} }}
</style>
</head>
<body>
{chr(10).join(lines_out)}
</body>
</html>
"""
out = Path(__file__).with_name("ZERO_LEAD_ROOT_CAUSE.html")
out.write_text(html, encoding="utf-8")
print(f"wrote {out}")
