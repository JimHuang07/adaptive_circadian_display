// CPython's integer-seeded MT19937, including its 53-bit uniform and cached Gaussian.
export class PythonRandom {
  private readonly state = new Uint32Array(624)
  private index = 624
  private spare: number | undefined

  constructor(seed: number) {
    const s = this.state
    s[0] = 19650218
    for (let i = 1; i < s.length; i++) {
      s[i] = Math.imul(1812433253, s[i - 1] ^ (s[i - 1] >>> 30)) + i
    }
    let i = 1
    const advance = () => {
      if (++i === s.length) {
        s[0] = s[s.length - 1]
        i = 1
      }
    }
    for (let count = 0; count < s.length; count++) {
      s[i] = (s[i] ^ Math.imul(s[i - 1] ^ (s[i - 1] >>> 30), 1664525)) + seed
      advance()
    }
    for (let count = 0; count < s.length - 1; count++) {
      s[i] = (s[i] ^ Math.imul(s[i - 1] ^ (s[i - 1] >>> 30), 1566083941)) - i
      advance()
    }
    s[0] = 0x80000000
  }

  private word() {
    const s = this.state
    if (this.index === s.length) {
      for (let i = 0; i < s.length; i++) {
        const bits = (s[i] & 0x80000000) | (s[(i + 1) % s.length] & 0x7fffffff)
        s[i] = s[(i + 397) % s.length] ^ (bits >>> 1) ^ ((bits & 1) ? 0x9908b0df : 0)
      }
      this.index = 0
    }
    let bits = s[this.index++]
    bits ^= bits >>> 11
    bits ^= (bits << 7) & 0x9d2c5680
    bits ^= (bits << 15) & 0xefc60000
    return (bits ^ (bits >>> 18)) >>> 0
  }

  uniform() {
    return ((this.word() >>> 5) * 67108864 + (this.word() >>> 6)) / 9007199254740992
  }

  gaussian(sd: number) {
    if (this.spare !== undefined) {
      const value = this.spare
      this.spare = undefined
      return value * sd
    }
    const angle = this.uniform() * (2 * Math.PI)
    const radius = Math.sqrt(-2 * Math.log(1 - this.uniform()))
    this.spare = Math.sin(angle) * radius
    return Math.cos(angle) * radius * sd
  }
}
