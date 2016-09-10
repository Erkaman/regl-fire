/*
  This script renders a cheap-looking fire effect with regl.
 */
const canvas = document.body.appendChild(document.createElement('canvas'))
var str = `<a href="https://github.com/Erkaman/regl-fire/"><img style="position: absolute; top: 0; left: 0; border: 0;" src="https://camo.githubusercontent.com/82b228a3648bf44fc1163ef44c62fcc60081495e/68747470733a2f2f73332e616d617a6f6e6177732e636f6d2f6769746875622f726962626f6e732f666f726b6d655f6c6566745f7265645f6161303030302e706e67" alt="Fork me on GitHub" data-canonical-src="https://s3.amazonaws.com/github/ribbons/forkme_left_red_aa0000.png"></a>`

var container = document.createElement('div')
container.innerHTML = str
document.body.appendChild(container)
window.addEventListener('resize', require('canvas-fit')(canvas), false)

const regl = require('regl')({ canvas: canvas })

const vec3 = require('gl-vec3')
var rng = require('seedrandom')('hello.')

const camera = require('regl-camera')(regl, {
  center: [0, 1.8, 0],
  distance: 6.4,
  up: [0.0, 1.0, 0.0],
  theta: 2.1
})

const fbo = regl.framebuffer({
  color: regl.texture({
    // we will be upscaling the fbo, so set a good mag filter!
    mag: 'linear'
  })
})

const renderFbo = regl({
  uniforms: {
    tex: regl.prop('particleTexture')
  },
  blend: {
    enable: true,
    func: { // set to additive blending.
      src: 'src alpha',
      dst: 'one'
    }
  },
  depth: {
    enable: false
  },
  framebuffer: fbo
})

const drawParticle = regl({
  frag: `
  precision mediump float;
  varying vec2 vUv;

  uniform sampler2D tex;
  uniform vec4 color;

  void main () {
    gl_FragColor = vec4(texture2D(tex, vUv) * color);
  }`,
  vert: `
  precision mediump float;
  uniform mat4 projection, view;
  uniform vec3 eye;
  uniform vec3 translation;
  uniform float scale;

  attribute vec2 position;
  varying vec2 vUv;
  void main () {
    vUv = position + vec2(0.5);

    vec3 p = vec3(position * scale, 0.0) + translation;

    // we want to make sure that the billboard always faces the camera.
    // to do so, we define a basis.
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 normal = normalize(eye - translation);
    vec3 right = normalize(cross(up, normal));
    up = normalize(cross(normal, right));

    p = p.x * right + p.y * up + p.z * normal;

    gl_Position = projection * view * vec4(p, 1.0);
  }`,
  attributes: {
    position: [
      [+0.5, +0.5],
      [-0.5, +0.5],
      [-0.5, -0.5],
      [+0.5, -0.5]
    ]
  },
  elements: [
    0, 1, 2,
    2, 3, 0
  ],
  uniforms: {
    translation: regl.prop('translation'),
    scale: regl.prop('scale'),
    color: regl.prop('color')
  },

  cull: {enable: true}
})

const drawUpscaled = regl({
  frag: `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D tex;

  void main() {
    gl_FragColor = vec4(texture2D(tex, uv).xyz, 1.0);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,
  attributes: {
    position: [ -4, -4, 4, -4, 0, 4 ]
  },
  uniforms: {
    tex: ({count}) => fbo
  },
  depth: { enable: false },
  count: 3
})

// get random number in range [base - variance, base + variance]
function rand (base, variance) {
  if (base.length === 3) { // random vector
    return [
      base[0] + variance[0] * (rng() * 2.0 - 1.0),
      base[1] + variance[1] * (rng() * 2.0 - 1.0),
      base[2] + variance[2] * (rng() * 2.0 - 1.0)
    ]
  } else { // random scalar.
    return base + variance * (rng() * 2.0 - 1.0)
  }
}

function lerp (a, b, t) {
  if (a.length === 4) {
    return [
      a[0] * (1.0 - t) + b[0] * t,
      a[1] * (1.0 - t) + b[1] * t,
      a[2] * (1.0 - t) + b[2] * t,
      a[3] * (1.0 - t) + b[3] * t
    ]
  } else {
    return a * (1.0 - t) + b * t
  }
}

var particleTexture = regl.texture({
  data: require('./assets/particle.js'),
  mag: 'linear',
  min: 'linear mipmap linear'
})

var particles = []
var N = 300 // num particles

// create all the particles.
for (var i = 0; i < N; i++) {
  var l = rand(3.5, 1.5)
  particles.push({
    lifetime: l,
    age: l + 1.0, // set age so that the particle is initialized in the first iteration
    velocity: [0.0, 0.0, 0.0],
    scale: 1.0,
    color: [0.0, 0.0, 0.0, 0.0]
  })
}

function runParticleSystem () {
  var delta = 0.02 // delta time.

  for (var i = 0; i < N; i++) {
    var p = particles[i]

    // respawn the particle if it dies.
    if (p.age > p.lifetime) {
      var minV = 0.886
      var maxV = minV + 0.2
      var range = 0.305

      p.velocity[0] = -range + rng() * 2.0 * range
      p.velocity[1] = minV + rng() * (maxV - minV)
      p.velocity[2] = -range + rng() * 2.0 * range

      p.startScale = rand(0.70, 0.38)
      p.endScale = rand(0.22, 0.16)

      p.startColor = [1.0, 0.2, 0.0, 0.6]
      p.endColor = [1.0, 0.2, 0.0, 0.0]

      var s = 0.05
      p.translation = rand([0.0, 0.0, 0.0], [s, s, s])

      p.age = 0.0
    }

    var t = p.age / p.lifetime // the lerp factor.

    // update particle properties.
    vec3.scaleAndAdd(p.translation, p.translation, p.velocity, delta)
    p.scale = lerp(p.startScale, p.endScale, t)
    p.color = lerp(p.startColor, p.endColor, t)
    p.age += delta
  }
}

// warm up the particle system by running it for a couple of iterations.
// (otherwise, we get an ugly "puff of fire" in the beginning)
for (i = 0; i < 300; i++) {
  runParticleSystem()
}

/*
  First, we render the particle system to an fbo that is one fifth the size of the
  actual screen. Then, we upscale and render the particle system to the actual screen.

  Since particle systems in general have tons of overdraw, the per-fragment overhead
  is pretty expensive. We can mitigate this issue by rendering the particle system
  to a smaller fbo, since then the GPU don't have to process as many expensive fragments.

  You can read more here:
  http://http.developer.nvidia.com/GPUGems3/gpugems3_ch23.html
*/
regl.frame(({viewportWidth, viewportHeight}) => {
  var SCALE = 0.2
  fbo.resize(viewportWidth * SCALE, viewportHeight * SCALE)

  runParticleSystem()

  camera(() => {
    renderFbo({particleTexture}, () => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })

      drawParticle(particles)
    })
  })

  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  })

  drawUpscaled()
})
