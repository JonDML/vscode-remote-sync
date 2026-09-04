# vscode-remote-sync
Visual Studio Code extension for remote editing files only using rsync (over ssh) and tar

## Requisites

Local: VS Code, Node.js/npm, ssh and tar
Remote: sshd and tar

## SSH

`~/.ssh/config`:

    Host remote-board
        HostName 192.168.1.100
        User root
        IdentityFile ~/.ssh/id_ed25519

## Commands

- Open Remote Folder
- Pull Remote → Local
- Push Local → Remote
- Sync Now
- Check Remote Changes
