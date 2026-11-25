# claude-lazygit

A Claude Code plugin that adds `/lazygit`. It opens [LazyGit](https://github.com/jesseduffield/lazygit) over Claude in the same WezTerm tab, in the repo Claude has been changing. Press `q` to return to Claude.

It works when Claude starts in a folder with many repos or git worktrees. The command also works while Claude is busy.

## Which repo opens

The plugin remembers the repos that Claude and its subagents change during the session. `/lazygit` looks at the ones with uncommitted changes or unpushed commits. If there is one, it opens. If there are several, Claude shows a list of the four most recent, and you can also type a path.

If none has pending work, it opens the repo changed most recently, or the session folder when nothing was changed.

`/lazygit <path>` opens the repo at that path. Relative paths start from the session folder.

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

Claude Code uses Ctrl+G to edit the prompt in an external editor. After this change, use Ctrl+X Ctrl+E for that.

## Limits

- A shell command counts towards the folder the shell is in when it ends. In `cd repo && git commit` run by a subagent, or in `git -C repo commit`, the repo is not noticed. Edits made with the file tools always are.
- A branch with no upstream never counts as unpushed.
- The list resets after `/clear`, `/resume` and `/branch`.
- It does not work over a WezTerm connection where git and the files are on another machine.
