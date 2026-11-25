import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const repos = atom({ plugin: 'lazygit', key: 'repos' }, [])

const track = async ($: EngineInterface, path: string | Promise<string>) => {
  const copy = await $.vcs.detect({ path: await path })
  if (copy) await update($, repos, seen => [copy.root, ...seen.filter(root => root !== copy.root)])
}

const run = async ($: EngineInterface, argv: string[]) => {
  const { exitCode, stdout, stderr } = await $.process.run(argv)
  if (exitCode) throw new Error(stderr.trim() || `${argv[0]} exited with ${exitCode}`)
  return stdout.trim()
}

const status = async ($: EngineInterface, root: string) => {
  const argv = ['git', '--no-optional-locks', '-C', root, 'status', '--porcelain=v2', '--branch']
  const { exitCode, stdout } = await $.process.run(argv)
  return { root, isRepo: exitCode === 0, hasWork: /^[^#]|^# branch\.ab \+[1-9]/m.test(stdout) }
}

const choose = async ($: EngineInterface, folder: string) => {
  const found = await Promise.all((await read($, repos)).map(root => status($, root)))
  const present = found.filter(({ isRepo }) => isRepo)
  const changed = present.filter(({ hasWork }) => hasWork)
  if (changed.length < 2) return (changed[0] ?? present[0])?.root ?? folder
  const labels = changed
    .slice(0, 4)
    .map(({ root }) => (root.startsWith(`${folder}/`) ? root.slice(folder.length + 1) : root))
  return $.ui.ask('Which repo should LazyGit open?', { header: 'LazyGit', options: labels }).catch(() => undefined)
}

const open = async ($: EngineInterface, args: string) => {
  if (!(await $.env.get('WEZTERM_PANE'))) return '/lazygit needs Claude Code to run inside WezTerm.'
  const folder = await $.session.root()
  const picked = args || (await choose($, folder))
  if (!picked) return undefined
  const path = picked.replace(/^~(?=\/|$)/, (await $.env.get('HOME')) ?? '~').replace(/^(?!\/)/, `${folder}/`)
  if (!(await $.fs.exists(path))) return `No such path: ${path}`
  const copy = await $.vcs.detect({ path })
  if (!copy) return `Not a git repo: ${path}. Name one with /lazygit <path>.`
  await run($, ['lazygit', '--version'])
  const pane = await run($, ['wezterm', 'cli', 'split-pane', '--cwd', copy.root, '--', 'lazygit'])
  return run($, ['wezterm', 'cli', 'zoom-pane', '--zoom', '--pane-id', pane]).then(
    () => undefined,
    error => `LazyGit opened but is not full size. ${error.message}`,
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'lazygit',
      description: 'Open LazyGit in this WezTerm tab',
      argumentHint: '[path]',
      immediate: true,
      isTerminalOnly: true,
    })
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit', 'Bash'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isReadOnly) {
      const path = e.tool === 'Bash' ? $.session.cwd() : e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
      track($, path).catch(() => undefined)
    }
    return ran
  })

  on('command.run', { command: 'lazygit' }, async ($, e) => {
    const text = await open($, e.args.trim()).catch(error => `LazyGit did not open. ${error.message}`)
    return text ? { text } : {}
  })
}
