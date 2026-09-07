# WSL VM recovery and unattended container startup

Status on 07.09.2026: **prepared in the repository, not deployed or accepted**.
The authoring container exposes the active `/workspace/.devcontainer` mount
read-only and has neither `docker`, its socket, nor `wsl.exe`. The tracked
configuration matched that mount before this change. Editing the tracked copy
does not update the host configuration or the running container.

## Host remedy and evidence still required

The incident brief records VM deaths at 12:11 and 12:45 during GPU browser suites,
with dxgkrnl wait failures followed by Docker Desktop engine restarts. Those
observations identify the failing path; they do not prove that updating WSL fixes it.

From Windows, record `wsl --version` before and after `wsl --update`, restart
Docker Desktop, and inspect `%LOCALAPPDATA%\Temp\wsl-crashes`. Record crash dump
filenames/timestamps or explicitly record that the directory is absent or empty;
retain existing dumps. Microsoft documents the update command in its
[WSL troubleshooting guide](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting).

| Evidence | Result |
|---|---|
| WSL versions and update result | Pending host execution |
| Docker Desktop restart and recovery time | Pending host execution |
| Crash dump directory inspection | Pending host execution |
| One complete LARGE run and unchanged WSL boot ID | Pending reviewer execution |
| Unattended container restart drill | Pending host execution |

After the remedy, the reviewer runs `npm run test:large`, recording the repository
SHA, full verdict, timestamps, and `/proc/sys/kernel/random/boot_id` before and
after. A failed or interrupted run is not proof of survival. If the VM dies again,
stop this acceptance attempt and decide the software-rendering lane with the user:
it changes both the picture and runtime. No software lane is selected by this change.

## Deploy the prepared startup change

First land the repository change so `/workspace/hoa/scripts/batch-launcher.mjs`
supports `--arm`. On the Windows host, copy only the reviewed `Dockerfile`,
`devcontainer.json`, and new `container-entrypoint.sh` from the repository's
`.devcontainer` into the active host `.devcontainer`, preserving its other files
(including the host-only `CLAUDE.md` and hooks). Rebuild the container using that
configuration. A reload or `docker update` alone cannot install the entrypoint.

The image entrypoint checks the read-only configuration and restores the firewall
before calling `--arm` from the main checkout as `node`. An absent initial checkout
defers arming until `postCreateCommand` finishes filling the volume and installing
dependencies. A damaged existing checkout or failed startup exits with an error.
`--arm` uses the existing SessionStart decision: deliberate launcher `--stop`
records remain stopped, concurrent starts converge, and batch ticks retain their
existing pause and live-owner protections.

`overrideCommand: false` retains the image command, `init: true` reaps orphaned
children, and `shutdownAction: none` keeps closing VS Code from stopping the
container. See the [Dev Container metadata reference](https://raw.githubusercontent.com/devcontainers/spec/main/docs/specs/devcontainerjson-reference.md).
`--restart=unless-stopped` lets Docker recover an unexpectedly exited container
or a running container after engine recovery, while respecting a deliberate
container stop. Docker documents that a manual stop suppresses automatic restart;
the drill must therefore explicitly start it again. See
[Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/).

## Host drill without a VS Code session

Schedule this after the batch's work is committed and no browser suite is running;
stopping the container kills every author and owner in it. Use a Windows terminal
outside VS Code and close all VS Code windows attached to the container.

1. Identify the rebuilt container with `docker ps --no-trunc`. Record its ID,
   image ID, entrypoint, command, restart policy and start time using
   `docker inspect <container-id>`. Confirm `unless-stopped`, the new entrypoint,
   and no editor attachment. Leave it running for at least 10 seconds before
   testing restart behavior, as required by Docker's restart-policy semantics.
2. Record the launcher's `--status` and the existing batch pause state. An
   intentional launcher stop needs an explicit `--start` before this drill can
   test recovery; preserve any user-requested batch pause.
3. Run `docker stop <container-id>`, then start a stopwatch and run
   `docker start <container-id>` from that same external terminal. Do not reopen
   VS Code or invoke the SessionStart hook, `--start`, or `--arm`.
4. Poll with `docker exec --user node --workdir /workspace/hoa <container-id>
   node scripts/batch-launcher.mjs --status`. Its exit code alone proves nothing:
   require `state: ready` or `running`, a live recorded PID, and a fresh
   `lastTickAt` from this container start. Record time to that state. Inspect
   `/proc/<pid>/cmdline` inside the container to confirm it is the launcher daemon.
   Allow at most 60 seconds; otherwise record the failure and container logs.
5. Keep the launcher alive through a second status sample after 10 seconds and
   record both samples, `docker logs`, and the elapsed time. This proves the
   Docker start path without an editor, not engine recovery by itself.
6. With the container running again, restart Docker Desktop from Windows and
   repeat the observations without `docker start` or VS Code. Record automatic
   container recovery and launcher time separately from the manual stop/start
   drill. This tests the restart policy as well as the entrypoint.

The unit tests exercise startup ordering, command forwarding, repeated startup,
empty-volume deferral, read-only configuration enforcement and failure exits with
isolated fixtures. They do not count as the Docker drill or the LARGE proof.
