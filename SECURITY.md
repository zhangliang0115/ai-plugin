# Security Policy

## Scope

`aipx` (this repo) is a file-moving CLI: it downloads GitHub tarballs, copies
skill folders into agent skill roots, and creates symlinks. It does **not**
execute code from third-party payloads at install time.

Two boundaries worth knowing:

- **Skills are instructions for your agents.** A malicious SKILL.md could try
  to social-engineer an agent into running harmful commands. Install skills
  from authors you trust, review `SKILL.md` content like you review any script
  you run, and prefer pinned refs (`.../tree/<sha>/...`) for untrusted sources.
- **dsh bundle installs run under dsh's own model.** Installing a dsh bundle
  (`dsh plugin add …`) can execute its code on your machine — that's dsh's
  documented permission gate (`allowBuilds`), not aipx's. aipx only ever
  prints those commands; it never runs them for you.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

## Reporting a vulnerability

Please use
[GitHub private vulnerability reporting](https://github.com/zhangliang0115/ai-plugin/security/advisories/new)
for anything you believe is exploitable (path traversal in payload handling,
manifest injection, etc.). For public, non-sensitive bugs, open a regular
issue. You can expect a response within 7 days.
