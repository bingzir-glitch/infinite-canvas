// 纯 JS 的 SHA-256 / SHA-512 实现：crypto.subtle 只在安全上下文
// （HTTPS/localhost）可用，http 站点上直接调会抛 TypeError。
// 有 subtle 就用 subtle（快），没有就走这里（插件安装校验、文件同步校验在
// http 下全靠它）。实现为标准算法，已用 Node 原生 crypto 逐字节对过。

function rotr32(value: number, shift: number) {
    return (value >>> shift) | (value << (32 - shift));
}

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256JS(data: Uint8Array): Uint8Array {
    const bitLength = data.length * 8;
    const paddedLength = (((data.length + 8) >> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLength);
    padded.set(data);
    padded[data.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Array<number>(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + s1 + ch + K256[i] + w[i]) | 0;
            const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (s0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => outView.setUint32(i * 4, v >>> 0, false));
    return out;
}

// ---------------------------------------------------------------------------
// SHA-512（64 位用高低 32 位两部分模拟，避免 BigInt 的性能坑）
// ---------------------------------------------------------------------------
//
// 常量按 FIPS 180-4 定义在运行时推导，而非硬编码：K 取前 80 个素数立方根的
// 小数部分，IV 取前 8 个素数平方根的小数部分。整数牛顿迭代保证结果精确，
// 彻底规避手抄 160 个常数必然出现的抄写错误。首次调用时计算一次并缓存。
// （教训：第一版手抄的 K512_LOW 表就是错的，空串向量直接挂掉。）

function firstPrimes(count: number): number[] {
    const primes: number[] = [];
    const sieve = new Uint8Array(600);
    for (let i = 2; i < sieve.length && primes.length < count; i++) {
        if (sieve[i]) continue;
        primes.push(i);
        for (let j = i * i; j < sieve.length; j += i) sieve[j] = 1;
    }
    return primes;
}

function bitLengthOf(n: bigint): number {
    let bits = 0;
    for (let x = n; x > 0n; x >>= 1n) bits++;
    return bits;
}

/** 整数开立方（向下取整）：牛顿迭代，全 BigInt 精确计算。 */
function icbrt(n: bigint): bigint {
    let x = 1n << BigInt(Math.ceil(bitLengthOf(n) / 3) + 1);
    for (;;) {
        if (x === 0n) return 0n;
        const y = (2n * x + n / (x * x)) / 3n;
        if (y >= x) return x;
        x = y;
    }
}

/** 整数开平方（向下取整）：牛顿迭代，全 BigInt 精确计算。 */
function isqrt(n: bigint): bigint {
    let x = 1n << BigInt(Math.ceil(bitLengthOf(n) / 2) + 1);
    for (;;) {
        if (x === 0n) return 0n;
        const y = (x + n / x) >> 1n;
        if (y >= x) return x;
        x = y;
    }
}

const MASK64 = (1n << 64n) - 1n;

type Sha512Constants = { kHigh: number[]; kLow: number[]; iv: Array<[number, number]> };
let sha512Constants: Sha512Constants | undefined;

function getSha512Constants(): Sha512Constants {
    if (sha512Constants) return sha512Constants;
    const primes = firstPrimes(80);
    const kHigh: number[] = [];
    const kLow: number[] = [];
    for (const p of primes) {
        // cbrt(p) = cbrt(p * 2^192) / 2^64，取低 64 位即小数部分
        const frac = icbrt(BigInt(p) << 192n) & MASK64;
        kHigh.push(Number(frac >> 32n));
        kLow.push(Number(frac & 0xffffffffn));
    }
    const iv: Array<[number, number]> = [];
    for (const p of primes.slice(0, 8)) {
        // sqrt(p) = sqrt(p * 2^128) / 2^64，取低 64 位即小数部分
        const frac = isqrt(BigInt(p) << 128n) & MASK64;
        iv.push([Number(frac >> 32n), Number(frac & 0xffffffffn)]);
    }
    sha512Constants = { kHigh, kLow, iv };
    return sha512Constants;
}

export function sha512JS(data: Uint8Array): Uint8Array {
    // 补位：1 + k 个 0 + 128 位长度（SHA-512 块 1024 位）
    const bitLow = (data.length * 8) >>> 0;
    const bitHigh = Math.floor(data.length / 0x20000000);
    const paddedLength = (((data.length + 16) >> 7) + 1) << 7;
    const padded = new Uint8Array(paddedLength);
    padded.set(data);
    padded[data.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 4, bitLow, false);
    view.setUint32(paddedLength - 8, 0, false);
    view.setUint32(paddedLength - 12, bitHigh, false);
    view.setUint32(paddedLength - 16, 0, false);

    const { kHigh, kLow, iv } = getSha512Constants();

    let h0h = iv[0][0], h0l = iv[0][1], h1h = iv[1][0], h1l = iv[1][1], h2h = iv[2][0], h2l = iv[2][1], h3h = iv[3][0], h3l = iv[3][1];
    let h4h = iv[4][0], h4l = iv[4][1], h5h = iv[5][0], h5l = iv[5][1], h6h = iv[6][0], h6l = iv[6][1], h7h = iv[7][0], h7l = iv[7][1];

    // 64 位加：低 32 位相加，高 32 位加进位（进位判断用无符号比较）
    const add3 = (ah: number, al: number, bh: number, bl: number, ch: number, cl: number): [number, number] => {
        const l1 = (al + bl) | 0;
        const c1 = l1 >>> 0 < (al >>> 0) ? 1 : 0;
        const l2 = (l1 + cl) | 0;
        const c2 = l2 >>> 0 < (l1 >>> 0) ? 1 : 0;
        return [(ah + bh + ch + c1 + c2) | 0, l2];
    };
    const rotr64 = (h: number, l: number, s: number): [number, number] => (s === 32 ? [l, h] : s < 32 ? [((h >>> s) | (l << (32 - s))) | 0, ((l >>> s) | (h << (32 - s))) | 0] : [((l >>> (s - 32)) | (h << (64 - s))) | 0, ((h >>> (s - 32)) | (l << (64 - s))) | 0]);
    const xor64 = (ah: number, al: number, bh: number, bl: number): [number, number] => [(ah ^ bh) | 0, (al ^ bl) | 0];
    const and64 = (ah: number, al: number, bh: number, bl: number): [number, number] => [(ah & bh) | 0, (al & bl) | 0];
    const not64 = (h: number, l: number): [number, number] => [~h, ~l];

    const wh: number[] = new Array(80);
    const wl: number[] = new Array(80);
    for (let offset = 0; offset < paddedLength; offset += 128) {
        for (let i = 0; i < 16; i++) {
            wh[i] = view.getUint32(offset + i * 8, false);
            wl[i] = view.getUint32(offset + i * 8 + 4, false);
        }
        for (let i = 16; i < 80; i++) {
            // s0 = ROTR(1) ^ ROTR(8) ^ SHR(7)
            let [a, b] = rotr64(wh[i - 15], wl[i - 15], 1);
            let [c, d] = rotr64(wh[i - 15], wl[i - 15], 8);
            let [eh, el] = xor64(a, b, c, d);
            const shrH = wh[i - 15] >>> 7, shrL = ((wl[i - 15] >>> 7) | (wh[i - 15] << 25)) | 0;
            [eh, el] = xor64(eh, el, shrH, shrL);
            // s1 = ROTR(19) ^ ROTR(61) ^ SHR(6)
            let [f, g] = rotr64(wh[i - 2], wl[i - 2], 19);
            let [hh, ll] = rotr64(wh[i - 2], wl[i - 2], 61);
            let [ih, il] = xor64(f, g, hh, ll);
            const shr2H = wh[i - 2] >>> 6, shr2L = ((wl[i - 2] >>> 6) | (wh[i - 2] << 26)) | 0;
            [ih, il] = xor64(ih, il, shr2H, shr2L);
            // w[i] = w[i-16] + s0 + w[i-7] + s1
            let [rh, rl] = add3(wh[i - 16], wl[i - 16], eh, el, wh[i - 7], wl[i - 7]);
            [rh, rl] = add3(rh, rl, ih, il, 0, 0);
            wh[i] = rh; wl[i] = rl;
        }
        let ah = h0h, al = h0l, bh = h1h, bl = h1l, ch = h2h, cl = h2l, dh = h3h, dl = h3l;
        let eh = h4h, el = h4l, fh = h5h, fl = h5l, gh = h6h, gl = h6l, hh = h7h, hl = h7l;
        for (let i = 0; i < 80; i++) {
            // S1 = ROTR(14) ^ ROTR(18) ^ ROTR(41)
            let [s1h, s1l] = rotr64(eh, el, 14);
            let [t1h, t1l] = rotr64(eh, el, 18);
            [s1h, s1l] = xor64(s1h, s1l, t1h, t1l);
            [t1h, t1l] = rotr64(eh, el, 41);
            [s1h, s1l] = xor64(s1h, s1l, t1h, t1l);
            // Ch = (e AND f) XOR ((NOT e) AND g)
            let [efh, efl] = and64(eh, el, fh, fl);
            const [neh, nel] = not64(eh, el);
            let [ngh, ngl] = and64(neh, nel, gh, gl);
            let [chh, chl] = xor64(efh, efl, ngh, ngl);
            // temp1 = h + S1 + Ch + k[i] + w[i]
            let [tah, tal] = add3(hh, hl, s1h, s1l, chh, chl);
            [tah, tal] = add3(tah, tal, kHigh[i], kLow[i], wh[i], wl[i]);
            // S0 = ROTR(28) ^ ROTR(34) ^ ROTR(39)
            let [s0h, s0l] = rotr64(ah, al, 28);
            [t1h, t1l] = rotr64(ah, al, 34);
            [s0h, s0l] = xor64(s0h, s0l, t1h, t1l);
            [t1h, t1l] = rotr64(ah, al, 39);
            [s0h, s0l] = xor64(s0h, s0l, t1h, t1l);
            // Maj = (a AND b) XOR (a AND c) XOR (b AND c)
            let [m1h, m1l] = and64(ah, al, bh, bl);
            let [m2h, m2l] = and64(ah, al, ch, cl);
            [m1h, m1l] = xor64(m1h, m1l, m2h, m2l);
            [m2h, m2l] = and64(bh, bl, ch, cl);
            [m1h, m1l] = xor64(m1h, m1l, m2h, m2l);
            // temp2 = S0 + Maj
            let [t2h, t2l] = add3(s0h, s0l, m1h, m1l, 0, 0);
            hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
            [eh, el] = add3(dh, dl, tah, tal, 0, 0);
            dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
            [ah, al] = add3(tah, tal, t2h, t2l, 0, 0);
        }
        [h0h, h0l] = add3(h0h, h0l, ah, al, 0, 0);
        [h1h, h1l] = add3(h1h, h1l, bh, bl, 0, 0);
        [h2h, h2l] = add3(h2h, h2l, ch, cl, 0, 0);
        [h3h, h3l] = add3(h3h, h3l, dh, dl, 0, 0);
        [h4h, h4l] = add3(h4h, h4l, eh, el, 0, 0);
        [h5h, h5l] = add3(h5h, h5l, fh, fl, 0, 0);
        [h6h, h6l] = add3(h6h, h6l, gh, gl, 0, 0);
        [h7h, h7l] = add3(h7h, h7l, hh, hl, 0, 0);
    }
    const out = new Uint8Array(64);
    const outView = new DataView(out.buffer);
    const hs: Array<[number, number]> = [[h0h, h0l], [h1h, h1l], [h2h, h2l], [h3h, h3l], [h4h, h4l], [h5h, h5l], [h6h, h6l], [h7h, h7l]];
    hs.forEach(([h, l], i) => { outView.setUint32(i * 8, h >>> 0, false); outView.setUint32(i * 8 + 4, l >>> 0, false); });
    return out;
}

// ---------------------------------------------------------------------------
// 对外入口：有 subtle 用 subtle，没有就走纯 JS 实现
// ---------------------------------------------------------------------------

function hasSubtle(): boolean {
    try {
        return typeof globalThis.crypto?.subtle?.digest === "function";
    } catch {
        return false;
    }
}

export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
    if (hasSubtle()) return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data as BufferSource));
    return sha256JS(data);
}

export async function sha512Bytes(data: Uint8Array): Promise<Uint8Array> {
    if (hasSubtle()) return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-512", data as BufferSource));
    return sha512JS(data);
}
