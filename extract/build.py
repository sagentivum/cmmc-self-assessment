#!/usr/bin/env python3
"""Normalise the DIBCAC Access dump into SQLite + JSON."""
import csv, json, re, sqlite3, os, html

SRC = os.path.join(os.path.dirname(__file__), "csv")
OUT = "/Users/paul/Developer/Experiments/CMMC/data"
os.makedirs(OUT, exist_ok=True)


def txt(s):
    """Strip the Access rich-text HTML wrapper down to plain text."""
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</(div|p|li)>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(s)).strip()


def rows(name):
    """Read a dumped table. Keys in the source carry stray trailing whitespace
    (106/110 rows of LnkTbl_RequirementsToFamilies), so strip every value."""
    with open(os.path.join(SRC, name + ".csv"), encoding="utf-8") as f:
        return [{k: (v.strip() if isinstance(v, str) else v) for k, v in r.items()}
                for r in csv.DictReader(f)]


def num(s, default=None):
    return int(s) if s not in ("", None) else default


families = {r["Family_Number"]: r for r in rows("Tbl_Family_Names")}
req_family = {r["Requirement_Number"]: r["Family_Number"] for r in rows("LnkTbl_RequirementsToFamilies")}
objectives = {r["Objective_Number"]: r for r in rows("Tbl_Objectives")}

req_objs = {}
for r in rows("LnkTbl_RequirementsToObjectives"):
    req_objs.setdefault(r["Requirement_Number"], []).append(r["Objective_Number"])

catalogue = []
for r in sorted(rows("Tbl_Requirements"), key=lambda x: int(x["Req_Sorting"])):
    rn = r["Requirement_Number"]
    fam = families[req_family[rn]]
    catalogue.append({
        "requirement": rn,
        "sort": int(r["Req_Sorting"]),
        "cmmc_practice": r["CMMC_Practice_Number"],
        "family_number": fam["Family_Number"],
        "family_name": fam["Family_Name"],
        "cmmc_domain": fam["CMMC_Domain"],
        "description": txt(r["Requirement_Description"]),
        "discussion": txt(r["Requirement_Discussion"]),
        "weight": num(r["Requirement_Score"], 0),
        "partial_weight": num(r["Requirement_Special_Considerations_Score"]),
        "partial_rule": txt(r["Requirement_Special_Considerations"]) or None,
        "objectives": [
            {
                "objective": on,
                "text": txt(objectives[on]["Objective_Text"]),
                "evidence_standard": objectives[on]["Standard"] or None,
            }
            for on in sorted(req_objs.get(rn, []))
        ],
    })

with open(os.path.join(OUT, "catalogue.json"), "w", encoding="utf-8") as f:
    json.dump(catalogue, f, indent=2, ensure_ascii=False)

db_path = os.path.join(OUT, "cmmc.sqlite")
if os.path.exists(db_path):
    os.remove(db_path)
db = sqlite3.connect(db_path)
db.executescript("""
CREATE TABLE family (
  family_number TEXT PRIMARY KEY, family_name TEXT, cmmc_domain TEXT, sort INTEGER);
CREATE TABLE requirement (
  requirement TEXT PRIMARY KEY, sort INTEGER, cmmc_practice TEXT,
  family_number TEXT REFERENCES family(family_number),
  description TEXT, discussion TEXT,
  weight INTEGER NOT NULL, partial_weight INTEGER, partial_rule TEXT);
CREATE TABLE objective (
  objective TEXT PRIMARY KEY,
  requirement TEXT REFERENCES requirement(requirement),
  text TEXT, evidence_standard TEXT);
CREATE INDEX idx_obj_req ON objective(requirement);
""")

for f_ in sorted(families.values(), key=lambda x: int(x["Sorting"])):
    db.execute("INSERT INTO family VALUES (?,?,?,?)",
               (f_["Family_Number"], f_["Family_Name"], f_["CMMC_Domain"], int(f_["Sorting"])))

for c in catalogue:
    db.execute("INSERT INTO requirement VALUES (?,?,?,?,?,?,?,?,?)",
               (c["requirement"], c["sort"], c["cmmc_practice"], c["family_number"],
                c["description"], c["discussion"], c["weight"], c["partial_weight"], c["partial_rule"]))
    for o in c["objectives"]:
        db.execute("INSERT INTO objective VALUES (?,?,?,?)",
                   (o["objective"], c["requirement"], o["text"], o["evidence_standard"]))
db.commit()

# ---- verify against the Access scoring queries (Qry_Scorecard / Qry_Scorecard_Feed) ----
total = db.execute("SELECT SUM(weight) FROM requirement").fetchone()[0]
floor = 110 - total
n_req, n_obj = (db.execute("SELECT COUNT(*) FROM requirement").fetchone()[0],
                db.execute("SELECT COUNT(*) FROM objective").fetchone()[0])
print(f"requirements={n_req}  objectives={n_obj}  families={len(families)}")
print(f"sum(weights)={total}  ->  worst-case score 110-{total} = {floor}   (expect -203)")
assert n_req == 110 and n_obj == 320 and floor == -203, "methodology check failed"
print(f"\nwrote {db_path}")
print(f"wrote {os.path.join(OUT, 'catalogue.json')}")
db.close()
