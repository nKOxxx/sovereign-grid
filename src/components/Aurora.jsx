// src/components/Aurora.jsx
// Aurora hero layer adapted from React Bits (ogl). LOW-INTENSITY decorative
// glow: absolute, aria-hidden, pointer-events-none, opacity<=0.5 (set via the
// `style` prop by the caller), rendered behind hero content.
//
// - `prefers-reduced-motion` -> static gradient fallback (no WebGL loop).
// - If WebGL is unavailable, falls back to a static gradient instead of
//   throwing, so the canvas never hard-fails (D12: no console errors).
// - All rendering happens in useEffect/requestAnimationFrame, so SSR / node
//   rendering only ever emits a plain container div — safe in tests.
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl'
import { useEffect, useRef } from 'react'

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop { vec3 color; float position; };

#define COLOR_RAMP(colors, factor, finalColor) \
  int _idx = 0; \
  for (int _i = 0; _i < 2; _i++) { ColorStop _c = colors[_i]; _idx = int(mix(float(_idx), float(_i), float(_c.position <= factor))); } \
  ColorStop _c0 = colors[_idx]; ColorStop _c1 = colors[_idx + 1]; \
  float _range = _c1.position - _c0.position; \
  float _lerp = (factor - _c0.position) / _range; \
  finalColor = mix(_c0.color, _c1.color, _lerp);

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`

export default function Aurora({
  colorStops = ['#16407f', '#3e8bff', '#0d1e3f'],
  amplitude = 0.7,
  blend = 0.45,
  speed = 1.0,
  className = '',
  style,
  'aria-hidden': ariaHidden = true,
}) {
  const ctnDom = useRef(null)
  const propsRef = useRef({ colorStops, amplitude, blend, speed })
  propsRef.current = { colorStops, amplitude, blend, speed }

  useEffect(() => {
    const ctn = ctnDom.current
    if (!ctn) return

    const setStatic = () => {
      ctn.style.background = `linear-gradient(180deg, ${colorStops.join(', ')})`
    }

    const prefersReduced =
      typeof window === 'undefined' ||
      !window.matchMedia ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setStatic()
      return
    }

    let renderer, program, mesh, gl, animateId = 0
    let disposed = false

    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true })
      gl = renderer.gl
      gl.clearColor(0, 0, 0, 0)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.canvas.style.backgroundColor = 'transparent'
    } catch (err) {
      setStatic()
      return
    }

    const geometry = new Triangle(gl)
    if (geometry.attributes && geometry.attributes.uv) delete geometry.attributes.uv

    const toColor = (hex) => {
      const c = new Color(hex)
      return [c.r, c.g, c.b]
    }

    const resize = () => {
      if (!ctn || !program) return
      const w = Math.max(1, ctn.offsetWidth || window.innerWidth || 1)
      const h = Math.max(1, ctn.offsetHeight || 520)
      renderer.setSize(w, h)
      program.uniforms.uResolution.value = [w, h]
    }
    window.addEventListener('resize', resize)

    program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uColorStops: { value: colorStops.map(toColor) },
        uResolution: { value: [1, 1] },
        uBlend: { value: blend },
      },
    })
    mesh = new Mesh(gl, { geometry, program })
    ctn.appendChild(gl.canvas)

    const update = (t) => {
      if (disposed) return
      animateId = requestAnimationFrame(update)
      const p = propsRef.current
      program.uniforms.uTime.value = (p.speed ?? 1) * t * 0.001
      program.uniforms.uAmplitude.value = p.amplitude ?? amplitude
      program.uniforms.uBlend.value = p.blend ?? blend
      program.uniforms.uColorStops.value = (p.colorStops ?? colorStops).map(toColor)
      renderer.render({ scene: mesh })
    }
    animateId = requestAnimationFrame(update)
    resize()

    return () => {
      disposed = true
      cancelAnimationFrame(animateId)
      window.removeEventListener('resize', resize)
      if (ctn && gl.canvas && gl.canvas.parentNode === ctn) ctn.removeChild(gl.canvas)
      try { gl.getExtension('WEBGL_lose_context')?.loseContext() } catch (e) { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={ctnDom} aria-hidden={ariaHidden} className={className} style={style} />
}
