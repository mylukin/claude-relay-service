jest.mock('../config/config', () => ({
  security: { encryptionKey: 'test-encryption-key' },
  claude: {}
}))

jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(),
  setClaudeAccount: jest.fn(),
  deleteSessionAccountMapping: jest.fn()
}))

jest.mock('../src/services/tokenRefreshService', () => ({
  acquireRefreshLock: jest.fn(),
  releaseRefreshLock: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  authDetail: jest.fn()
}))

jest.mock('../src/utils/tokenRefreshLogger', () => ({
  logRefreshStart: jest.fn(),
  logRefreshSuccess: jest.fn(),
  logRefreshError: jest.fn(),
  logTokenUsage: jest.fn(),
  logRefreshSkipped: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  recordErrorHistory: jest.fn()
}))

const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({
  unref: jest.fn()
}))

const redis = require('../src/models/redis')
const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
const claudeAccountService = require('../src/services/account/claudeAccountService')

describe('ClaudeAccountService rate-limit handling', () => {
  afterAll(() => {
    setIntervalSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    upstreamErrorHelper.recordErrorHistory.mockResolvedValue(undefined)
  })

  it('does not mark an account rate limited when a 429 has no authoritative reset timestamp', async () => {
    redis.getClaudeAccount.mockResolvedValue({
      id: 'acct-1',
      name: 'Claude Account',
      status: 'active',
      schedulable: 'true'
    })

    const result = await claudeAccountService.markAccountRateLimited('acct-1', 'session-hash')

    expect(result).toEqual({ success: true, skipped: true })
    expect(redis.setClaudeAccount).not.toHaveBeenCalled()
    expect(redis.deleteSessionAccountMapping).not.toHaveBeenCalled()
    expect(upstreamErrorHelper.recordErrorHistory).toHaveBeenCalledWith(
      'acct-1',
      'claude-official',
      429,
      'rate_limit'
    )
  })
})
