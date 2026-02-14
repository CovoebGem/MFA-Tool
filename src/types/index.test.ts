import { describe, it, expect } from 'vitest'
import type { OTPAccount } from './index'
import { QRDecodeError, ParseError, ValidationError } from './index'

describe('OTPAccount type', () => {
  it('should create a valid OTPAccount object', () => {
    const account: OTPAccount = {
      id: 'test-id',
      issuer: 'GitHub',
      name: 'user@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      counter: 0,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      createdAt: Date.now(),
      groupId: 'default',
    }
    expect(account.issuer).toBe('GitHub')
    expect(account.type).toBe('totp')
    expect(account.digits).toBe(6)
  })
})

describe('Error types', () => {
  it('QRDecodeError should have correct name', () => {
    const err = new QRDecodeError('test')
    expect(err.name).toBe('QRDecodeError')
    expect(err.message).toBe('test')
    expect(err).toBeInstanceOf(Error)
  })

  it('ParseError should have correct name', () => {
    const err = new ParseError('test')
    expect(err.name).toBe('ParseError')
    expect(err).toBeInstanceOf(Error)
  })

  it('ValidationError should have correct name and field', () => {
    const err = new ValidationError('test', 'secret')
    expect(err.name).toBe('ValidationError')
    expect(err.field).toBe('secret')
    expect(err).toBeInstanceOf(Error)
  })
})
