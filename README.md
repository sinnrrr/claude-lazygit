# claude-lazygit + Wezterm

A Claude Code plugin that adds `/lazygit`. It opens [LazyGit](https://github.com/jesseduffield/lazygit) over Claude in the same WezTerm tab, in the repo Claude has been changing. Press `q` to return to Claude.

![LazyGit opening over Claude Code in a WezTerm tab, then committing a new file](assets/demo.gif)

## Install

You need [WezTerm](https://wezterm.org), git, LazyGit and Claude Code. It was tested on macOS with Claude Code 2.1.332.

```sh
claude plugin install lazygit --marketplace sinnrrr/claude-lazygit
```

## Ctrl+G

The plugin does not set a key. To open LazyGit with Ctrl+G, add this to `~/.claude/keybindings.json`:

```json
{
  "bindings": [
    { "context": "Chat", "bindings": { "ctrl+g": "command:lazygit" } }
  ]
}
```

Claude Code uses Ctrl+G to edit the prompt in an external editor. You'd need to rebind that to other shortcut, e.g. Ctrl+X Ctrl+E.

