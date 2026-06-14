jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock('../config/config', () => ({
  security: { encryptionKey: 'test-encryption-key' },
  claude: {}
}))

jest.mock('../src/models/redis', () => ({
  getClaudeAccount: jest.fn(),
  setClaudeAccount: jest.fn()
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

jest.mock('../src/utils/webhookNotifier', () => ({
  sendAccountAnomalyNotification: jest.fn()
}))

const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({
  unref: jest.fn()
}))

const axios = require('axios')
const redis = require('../src/models/redis')
const tokenRefreshService = require('../src/services/tokenRefreshService')
const claudeAccountService = require('../src/services/account/claudeAccountService')

describe('ClaudeAccountService OAuth refresh', () => {
  afterAll(() => {
    setIntervalSpy.mockRestore()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    tokenRefreshService.acquireRefreshLock.mockResolvedValue(true)
    tokenRefreshService.releaseRefreshLock.mockResolvedValue(true)
    redis.setClaudeAccount.mockResolvedValue(undefined)
  })

  it('refreshes tokens through claude.ai instead of the retired console.anthropic.com endpoint', async () => {
    const account = {
      id: 'acct-1',
      name: 'Claude Account',
      refreshToken: claudeAccountService._encryptSensitiveData('refresh-token'),
      scopes: 'user:profile user:inference'
    }
    redis.getClaudeAccount.mockResolvedValue(account)
    claudeAccountService.fetchAndUpdateAccountProfile = jest.fn().mockResolvedValue(undefined)
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600
      }
    })

    const result = await claudeAccountService.refreshAccountToken('acct-1')

    expect(result.accessToken).toBe('new-access-token')
    expect(axios.post).toHaveBeenCalledWith(
      'https://claude.ai/v1/oauth/token',
      expect.objectContaining({
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: 'https://claude.ai',
          Referer: 'https://claude.ai/'
        })
      })
    )
    expect(redis.setClaudeAccount).toHaveBeenCalledWith(
      'acct-1',
      expect.objectContaining({
        status: 'active',
        errorMessage: ''
      })
    )
  })
})
