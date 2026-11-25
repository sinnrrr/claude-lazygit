import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

type Setup = {
  env?: Record<string, string>
  status?: Record<string, string>
  answer?: string
  missing?: string
  cwd?: string
  denied?: string
  broken?: boolean
  unzoomed?: boolean
}

const CLEAN = '# branch.oid 1\n# branch.head main\n'
const DIRTY = `${CLEAN}? new.txt\n`
const AHEAD = `${CLEAN}# branch.upstream origin/main\n# branch.ab +2 -0\n`
const LEVEL = `${CLEAN}# branch.upstream origin/main\n# branch.ab +0 -3\n`

const write = (root: string) => ({ tool: 'Write', file_path: `${root}/a.txt`, content: '' }) as const
const lazygit = (args = '') =>
  ({
    command: 'lazygit',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  }) as const

const stub = (on: On, setup: Setup = {}) => {
  const { env = { WEZTERM_PANE: '1', HOME: '/Users/me' }, status = {}, answer, missing, cwd = '/work', denied } = setup
  const ran: string[] = []
  const asked: string[][] = []
  mock.env(on, env)
  on('session.cwd', () => ({ value: cwd }))
  on('session.root', () => ({ value: '/work' }))
  on('fs.exists', (_, e) => ({ value: !e.path.includes('missing') }))
  on('vcs.detect', (_, e) => {
    if (setup.broken) throw new Error('broken')
    const root = /^.*\/repo-\w+/.exec(e.path)?.[0]
    return root
      ? { vcs: 'git', root, mainRoot: root, revision: null, branch: null, defaultBranch: null, remote: null }
      : null
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === missing) return { deny: `${missing} not found` }
    const isStatus = e.argv[0] === 'git'
    if (!isStatus) ran.push(e.argv.join(' '))
    const output = isStatus ? status[e.argv[3] ?? ''] : e.argv.includes('split-pane') ? '7\n' : ''
    return {
      value: {
        exitCode: output === undefined ? 128 : setup.unzoomed && e.argv.includes('zoom-pane') ? 1 : 0,
        stdout: output ?? '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('tool.call', (_, e) => {
    if (denied && e.tool === denied) return { deny: 'no' }
    if (e.tool === 'Bash' && e.command === 'ls') return { result: {}, isReadOnly: true }
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const question = e.questions[0]
    asked.push(question?.options.map(option => option.label) ?? [])
    return answer ? { result: { answers: { [question?.question ?? '']: answer } } } : { deny: 'dismissed' }
  })
  return { ran, asked }
}

const opened = (root: string) => [
  'lazygit --version',
  `wezterm cli split-pane --cwd ${root} -- sh -c printf "\\033]2;%s\\007" "$1" && exec lazygit sh Claude → lazygit: ${root.split('/').at(-1)}`,
  'wezterm cli zoom-pane --zoom --pane-id 7',
]

test('opens the one repo with work', async ($, on) => {
  const { ran, asked } = stub(on, { status: { '/work/repo-a': DIRTY, '/work/repo-b': CLEAN } })
  await $.tool.call(write('/work/repo-a'))
  await $.tool.call({ ...write('/work/repo-b'), agentId: 'a1' })
  expect((await $.command.run(lazygit())).text).toBeUndefined()
  expect(ran).toEqual(opened('/work/repo-a'))
  expect(asked).toEqual([])
})

test('asks with the newest four, in labels that stay unique', async ($, on) => {
  const roots = ['/work/repo-1', '/work/repo-2', '/work/x/repo-3', '/work/y/repo-3', '/away/repo-5']
  const status = Object.fromEntries(roots.map(root => [root, AHEAD]))
  const { ran, asked } = stub(on, { status, answer: 'x/repo-3' })
  for (const root of roots) await $.tool.call(write(root))
  await $.tool.call(write('/work/repo-2'))
  await $.command.run(lazygit())
  expect(asked).toEqual([['repo-2', '/away/repo-5', 'y/repo-3', 'x/repo-3']])
  expect(ran).toEqual(opened('/work/x/repo-3'))
})

test('a path typed under Other opens', async ($, on) => {
  const { ran } = stub(on, { status: { '/work/repo-a': DIRTY, '/work/repo-b': DIRTY }, answer: '~/repo-c' })
  await $.tool.call(write('/work/repo-a'))
  await $.tool.call(write('/work/repo-b'))
  await $.command.run(lazygit())
  expect(ran).toEqual(opened('/Users/me/repo-c'))
})

test('text under Other that is no path says so', async ($, on) => {
  stub(on, { status: { '/work/repo-a': DIRTY, '/work/repo-b': DIRTY }, answer: 'missing one' })
  await $.tool.call(write('/work/repo-a'))
  await $.tool.call(write('/work/repo-b'))
  expect((await $.command.run(lazygit())).text).toBe('No such path: /work/missing one')
})

test('a dismissed question opens nothing', async ($, on) => {
  const { ran } = stub(on, { status: { '/work/repo-a': DIRTY, '/work/repo-b': DIRTY } })
  await $.tool.call(write('/work/repo-a'))
  await $.tool.call(write('/work/repo-b'))
  expect((await $.command.run(lazygit())).text).toBeUndefined()
  expect(ran).toEqual([])
})

test('with no work pending the newest repo still there opens', async ($, on) => {
  const { ran } = stub(on, { status: { '/work/repo-a': CLEAN, '/work/repo-b': LEVEL } })
  for (const root of ['/work/repo-a', '/work/repo-b', '/work/repo-gone']) await $.tool.call(write(root))
  await $.command.run(lazygit())
  expect(ran).toEqual(opened('/work/repo-b'))
})

test('a shell command counts for its folder unless it only read', async ($, on) => {
  const { ran } = stub(on, { status: { '/work/repo-b': DIRTY }, cwd: '/work/repo-b' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect((await $.command.run(lazygit())).text).toMatch(/^Not a git repo: \/work/)
  await $.tool.call({ tool: 'Bash', command: 'touch a' })
  await $.command.run(lazygit())
  expect(ran).toEqual(opened('/work/repo-b'))
})

test('a refused edit is not counted', async ($, on) => {
  stub(on, { denied: 'Write' })
  await $.tool.call(write('/work/repo-a'))
  expect((await $.command.run(lazygit())).text).toMatch(/^Not a git repo/)
})

test('a path names the repo', async ($, on) => {
  const { ran } = stub(on)
  await $.command.run(lazygit(' repo-a/src '))
  await $.command.run(lazygit('~/repo-b'))
  await $.command.run(lazygit('/away/repo-c'))
  expect(ran).toEqual(['/work/repo-a', '/Users/me/repo-b', '/away/repo-c'].flatMap(opened))
  expect((await $.command.run(lazygit('missing'))).text).toBe('No such path: /work/missing')
  expect((await $.command.run(lazygit('/plain'))).text).toMatch(/^Not a git repo: \/plain/)
})

test('outside WezTerm it says so', async ($, on) => {
  const { ran } = stub(on, { env: {} })
  expect((await $.command.run(lazygit('repo-a'))).text).toMatch(/inside WezTerm/)
  expect(ran).toEqual([])
})

for (const missing of ['lazygit', 'wezterm', 'git'])
  test(`a missing ${missing} is a message`, async ($, on) => {
    stub(on, { missing, status: { '/work/repo-a': DIRTY } })
    await $.tool.call(write('/work/repo-a'))
    expect((await $.command.run(lazygit())).text).toContain(`${missing} not found`)
  })

test('a pane that is not zoomed is reported as open', async ($, on) => {
  stub(on, { unzoomed: true })
  expect((await $.command.run(lazygit('repo-a'))).text).toBe('LazyGit opened but is not full size. wezterm exited with 1')
})

test('a failing repo lookup leaves the tool call alone', async ($, on) => {
  stub(on, { broken: true })
  expect(await $.tool.call(write('/work/repo-a'))).toMatchObject({ result: {} })
})

test('the command is registered to run mid-turn, in a terminal only', async ($, on) => {
  const specs: unknown[] = []
  on('command.register', (_, e) => {
    specs.push(e)
    return { value: { command: 'lazygit' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  expect(specs).toMatchObject([{ name: 'lazygit', immediate: true, isTerminalOnly: true }])
})
