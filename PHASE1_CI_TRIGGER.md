# Phase 1 CI Trigger

This file intentionally triggers a fresh CI run on the latest `deployment-hardening` commit after Phase 1 deployment hardening updates.

The previous failed workflow reruns were tied to an older commit and did not include the latest native dependency guard updates.
