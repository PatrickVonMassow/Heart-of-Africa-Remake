# Open capes and cloaks: report verdict against the picture

Evidence for the penetration report's line-of-sight rule under open outer
garments (`is_open` in `scripts/villager/penetration.py`). All runs at
`--stride 20`. "old" = the capped-bag rule, "new" = this rule; "vol" and
"head" are the two variants of branch feat/1337-outer-cloth-over-inner
(de609d0ad volume-only, 7e29080b5 per-frame layer resolve). Cells: max
(frames over tolerance).

| garment | col | main old | vol old | head old | main new | vol new | head new |
|---|---|---|---|---|---|---|---|
| g-shirt-chest | inner | 0.0860 (300) | 0.0063 (5) | 0.0552 (294) | 0.0860 (300) | 0.0403 (10) | 0.0552 (294) |
| g-shirt-chest | innerHole | 0.0528 (126) | 0.0061 (13) | 0.0451 (92) | 0.0528 (126) | 0.0209 (6) | 0.0451 (80) |
| g-skirtShort-waist | inner | 0.0236 (46) | 0.0024 (0) | 0.0276 (140) | 0.0176 (31) | 0.0000 (0) | 0.0151 (110) |
| g-skirtShort-waist | innerHole | 0.0104 (21) | 0.0000 (0) | 0.0077 (13) | 0.0104 (21) | 0.0000 (0) | 0.0077 (13) |
| g-skirtKnee-waist | inner | 0.0538 (101) | 0.0053 (3) | 0.0634 (161) | 0.0538 (96) | 0.0528 (10) | 0.0631 (139) |
| g-skirtKnee-waist | innerHole | 0.0450 (76) | 0.0129 (15) | 0.0136 (61) | 0.0450 (76) | 0.0081 (16) | 0.0136 (59) |
| g-trousers-waist | inner | 0.0806 (237) | 0.0237 (17) | 0.0806 (187) | 0.0806 (236) | 0.0169 (11) | 0.0806 (171) |
| g-trousers-waist | innerHole | 0.0776 (50) | 0.0059 (2) | 0.0689 (37) | 0.0776 (50) | 0.0024 (0) | 0.0689 (35) |
| g-robe-chest | inner | 0.0825 (300) | 0.0070 (2) | 0.0539 (298) | 0.0825 (300) | 0.0521 (10) | 0.0539 (298) |
| g-robe-chest | innerHole | 0.0475 (114) | 0.0052 (12) | 0.0446 (77) | 0.0475 (113) | 0.0055 (4) | 0.0446 (65) |
| g-breastCloth-chest | inner | 0.0839 (276) | 0.0056 (1) | 0.0546 (200) | 0.0839 (276) | 0.0052 (1) | 0.0546 (169) |
| g-breastCloth-chest | innerHole | 0.0658 (132) | 0.0081 (13) | 0.0512 (70) | 0.0658 (132) | 0.0047 (2) | 0.0512 (65) |
| g-wrapLong-chest | inner | 0.0817 (252) | 0.0044 (2) | 0.0587 (300) | 0.0817 (252) | 0.0363 (9) | 0.0495 (300) |
| g-wrapLong-chest | innerHole | 0.0731 (181) | 0.0246 (58) | 0.0551 (172) | 0.0731 (181) | 0.0098 (55) | 0.0551 (170) |
| ALL max / frames over | inner | 0.0860 (3392) | 0.0529 (65) | 0.0806 (3867) | 0.0860 (3297) | 0.0528 (73) | 0.0806 (3652) |
| ALL max / frames over | innerHole | 0.0776 (1437) | 0.0246 (213) | 0.0689 (1057) | 0.0776 (1435) | 0.0209 (160) | 0.0689 (981) |
| ALL max / frames over | cloth | 0.1562 (4837) | 0.1562 (4837) | 0.1562 (4837) | 0.1562 (4837) | 0.1562 (4837) | 0.1562 (4837) |
| ALL max / frames over | shown | 0.0593 (1263) | 0.0593 (1263) | 0.0593 (1263) | 0.0593 (1263) | 0.0593 (1263) | 0.0593 (1263) |
| ALL max / frames over | hole | 0.0623 (394) | 0.0623 (394) | 0.0623 (394) | 0.0623 (394) | 0.0623 (394) | 0.0623 (394) |
| ALL max / frames over | cut | 0.0617 (181) | 0.0617 (181) | 0.0617 (181) | 0.0617 (181) | 0.0617 (181) | 0.0617 (181) |

Closed garments: on main every closed-garment case and the cloth, shown,
hole and cut columns are byte-identical between old and new; only cases
under capes and cloaks change.

## Dig sheet, shirt under the one-shoulder cloak (az 35)

- `dig-main-shoulder.png` (main): plain / old markers / new markers.
  The red shirt visible through the cloak at the shoulder was passed by the
  old rule (magenta) and is counted by the new one (yellow).
- `dig-v1337-vol-shoulder.png` (vol): no red visible under the cloak; the
  new rule reports no shirt-under-cloak case in dig. The few magenta marks
  sit on the cloak edge where the shirt lies uncovered anyway.
- `dig-v1337-head-front-back.png` (head, front and back): no red visible
  under the cloak. The old rule counted 78-161 through-points per sheet
  frame, none seen by the camera and 80-100 % reachable by no line of
  sight; the new rule drops those.

Residual: head keeps shirt-under-cloak cases in dig (chest 0.0157, 17
frames). They are reachable by a line of sight from some direction, but
not visible in the az-35 sheet; the missing information is a view from
the side that reaches them (for example under the hem). Point 1337
judges them with that second view.

The committed `penetration-report.md` still carries the old rule's
numbers; the next full penetration build (point 1337) regenerates it.
