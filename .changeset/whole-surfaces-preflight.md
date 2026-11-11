---
'@segnavia/format': minor
'@segnavia/render': minor
---

Report measured preflight coverage and run slot and font preflight checks for deck PDFs, slide images and cover images.

Breaking for hosts: `PreflightReport.status` can now be `incomplete`, and every report includes `coverage`. Handle the new status when switching over every report status.
