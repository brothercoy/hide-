export class CRTEffect {
    constructor(sourceCanvas) {
        this.sourceCanvas = sourceCanvas;

        // Create WebGL canvas overlay
        this.glCanvas = document.createElement('canvas');
        this.glCanvas.style.position = 'fixed';
        this.glCanvas.style.top = '0';
        this.glCanvas.style.left = '0';
        this.glCanvas.style.width = '100%';
        this.glCanvas.style.height = '100%';
        this.glCanvas.style.pointerEvents = 'none';
        this.glCanvas.style.zIndex = '999';
        document.body.appendChild(this.glCanvas);

        this.gl = this.glCanvas.getContext('webgl2') || this.glCanvas.getContext('webgl');
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        this.uniforms = {
            scanlineIntensity: 0.6,
            scanlineCount: 500.0,
            time: 0.0,
            yOffset: 0.0,
            brightness: 1.3,
            contrast: 1.1,
            saturation: 1.2,
            bloomIntensity: 1.0,
            bloomThreshold: 0.03,
            rgbShift: 0.0,
            adaptiveIntensity: 3.0,
            vignetteStrength: 0.93,
            curvature: 0.2,
            flickerStrength: 0.03
        };

        this._initShader();
        this._initBuffers();
        this._initTexture();
        this._initBloomFBO();
    }

    _initShader() {
        const gl = this.gl;

        const vertSrc = `
            attribute vec2 a_position;
            attribute vec2 a_uv;
            varying vec2 vUv;
            void main() {
                vUv = a_uv;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        const fragSrc = `
            #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
            #else
                precision mediump float;
            #endif

            uniform sampler2D tDiffuse;
            uniform sampler2D bloomTex;
            uniform float scanlineIntensity;
            uniform float scanlineCount;
            uniform float time;
            uniform float yOffset;
            uniform float brightness;
            uniform float contrast;
            uniform float saturation;
            uniform float bloomIntensity;
            uniform float bloomThreshold;
            uniform float rgbShift;
            uniform float adaptiveIntensity;
            uniform float vignetteStrength;
            uniform float curvature;
            uniform float flickerStrength;

            varying vec2 vUv;

            const float PI = 3.14159265;
            const vec3 LUMA = vec3(0.299, 0.587, 0.114);
            const float BLOOM_THRESHOLD_FACTOR = 0.5;
            const float BLOOM_FACTOR_MULT = 1.5;
            const float RGB_SHIFT_SCALE = 0.005;
            const float RGB_SHIFT_INTENSITY = 0.08;

            vec2 curveRemapUV(vec2 uv, float curvature) {
                vec2 coords = uv * 2.0 - 1.0;
                float curveAmount = curvature * 0.25;
                float dist = dot(coords, coords);
                coords = coords * (1.0 + dist * curveAmount);
                return coords * 0.5 + 0.5;
            }

            vec4 sampleBloom(sampler2D tex, vec2 uv, float radius, vec4 centerSample) {
                vec2 o = vec2(radius);
                vec4 c = centerSample * 0.4;
                vec4 cross_ = (
                    texture2D(tex, uv + vec2(o.x, 0.0)) +
                    texture2D(tex, uv - vec2(o.x, 0.0)) +
                    texture2D(tex, uv + vec2(0.0, o.y)) +
                    texture2D(tex, uv - vec2(0.0, o.y))
                ) * 0.15;
                return c + cross_;
            }

            float vignetteApprox(vec2 uv, float strength) {
                vec2 vigCoord = uv * 2.0 - 1.0;
                float dist = max(abs(vigCoord.x), abs(vigCoord.y));
                return 1.0 - dist * dist * strength;
            }
            
            float rand(vec2 co) {
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            vec3 applyRasterization(vec2 uv, vec3 color) {
                vec2 pixelPos = fract(uv * vec2(800.0, 500.0));
                vec2 dist = abs(pixelPos - 0.5);
                float mask = 1.0 - smoothstep(0.25, 0.48, length(dist));
                return color * mix(1.0, mask, 0.3);
            }

            void main() {
                vec2 uv = vUv;

                if (curvature > 0.001) {
                    uv = curveRemapUV(uv, curvature);
                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        gl_FragColor = vec4(0.0);
                        return;
                    }
                }

                vec4 pixel = texture2D(tDiffuse, uv);

                if (bloomIntensity > 0.001) {
                    float pixelLum = dot(pixel.rgb, LUMA);
                    float bloomThresholdHalf = bloomThreshold * BLOOM_THRESHOLD_FACTOR;
                    if (pixelLum > bloomThresholdHalf) {
                        vec4 bloomSample = sampleBloom(tDiffuse, uv, 0.005, pixel);
                        bloomSample.rgb *= brightness;
                        float bloomLum = dot(bloomSample.rgb, LUMA);
                        float bloomFactor = bloomIntensity * max(0.0, (bloomLum - bloomThreshold) * BLOOM_FACTOR_MULT);
                        pixel.rgb += bloomSample.rgb * bloomFactor;
                    }
                }
                
                // Animated static noise — modulates the glow area
                float noiseVal = rand(uv * vec2(1600.0, 900.0) + vec2(fract(time * 1.3), fract(time * 0.7)));
                float bloomLum = dot(max(texture2D(tDiffuse, uv).rgb, vec3(0.0)), LUMA);

                // Sample brightness from a wide neighborhood
                float r = 0.003;
                float nearBright = 0.0;
                nearBright += dot(texture2D(tDiffuse, uv + vec2( r,  0.0)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2(-r,  0.0)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2( 0.0,  r)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2( 0.0, -r)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2( r,  r)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2(-r, -r)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2( r, -r)).rgb, LUMA);
                nearBright += dot(texture2D(tDiffuse, uv + vec2(-r,  r)).rgb, LUMA);
                nearBright /= 8.0;

                // Phosphor noise glow: grainy in bright areas, fades to dark in dark areas
                float noiseGlow = noiseVal * nearBright;
                pixel.rgb += vec3(0.0, noiseGlow, noiseGlow * 0.255) * bloomIntensity * 0.8;

                if (rgbShift > 0.005) {
                    float shift = rgbShift * RGB_SHIFT_SCALE;
                    pixel.r += texture2D(tDiffuse, vec2(uv.x + shift, uv.y)).r * RGB_SHIFT_INTENSITY;
                    pixel.b += texture2D(tDiffuse, vec2(uv.x - shift, uv.y)).b * RGB_SHIFT_INTENSITY;
                }

                pixel.rgb *= brightness;

                float luminance = dot(pixel.rgb, LUMA);
                pixel.rgb = (pixel.rgb - 0.5) * contrast + 0.5;
                pixel.rgb = mix(vec3(luminance), pixel.rgb, saturation);

                float lightingMask = 1.0;

                if (scanlineIntensity > 0.001) {
                    float scanlineY = (uv.y + yOffset) * scanlineCount;
                    float scanlinePattern = abs(sin(scanlineY * PI));

                    float adaptiveFactor = 1.0;
                    if (adaptiveIntensity > 0.001) {
                        float yPattern = sin(uv.y * 30.0) * 0.5 + 0.5;
                        adaptiveFactor = 1.0 - yPattern * adaptiveIntensity * 0.2;
                    }

                    lightingMask *= 1.0 - scanlinePattern * scanlineIntensity * adaptiveFactor;
                }

                if (flickerStrength > 0.001) {
                    lightingMask *= 1.0 + sin(time * 110.0) * flickerStrength;
                }

                pixel.rgb *= lightingMask;

                float lumField = texture2D(bloomTex, uv).r;
                lumField = smoothstep(0.0, 0.3, lumField);

                float staticNoise = rand(uv * vec2(1601.0, 901.0) + vec2(fract(time * 17.3), fract(time * 13.7)));
                pixel.rgb += vec3(0.0, staticNoise, staticNoise * 0.255) * lumField * 0.5;

                // Radial vignette for noise — bright center, fades to edges
                vec2 noiseCenter = uv - 0.5;
                float radialFade = 1.0 - smoothstep(0.0, 0.7, length(noiseCenter));

                float screenNoise = rand(uv * vec2(1601.0, 901.0) + vec2(fract(time * 17.3), fract(time * 13.7)));
                pixel.rgb += vec3(0.0, screenNoise, screenNoise * 0.255) * radialFade * 0.3;

                pixel.rgb = applyRasterization(uv, pixel.rgb);
                pixel.rgb += vec3(0.0, 0.09, 0.018);

                // Vignette applied last — no color distortion
                float vigStart = vignetteStrength;          // 0.0–1.0, how far in it starts
                float vigEnd = vignetteStrength + 0.09;     // feather width fixed at 0.08
                float vigEdge = max(abs(uv * 2.0 - 1.0).x, abs(uv * 2.0 - 1.0).y);
                float vignette = 1.0 - smoothstep(vigStart, vigEnd, vigEdge);
                pixel.rgb *= vignette;

                gl_FragColor = pixel;
            }
        `;

        const vert = this._compile(gl.VERTEX_SHADER, vertSrc);
        const frag = this._compile(gl.FRAGMENT_SHADER, fragSrc);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vert);
        gl.attachShader(this.program, frag);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Shader link error:', gl.getProgramInfoLog(this.program));
        }

        // Cache uniform locations
        this.uniformLocations = {};
        const uniformNames = Object.keys(this.uniforms);
        uniformNames.push('tDiffuse');
        uniformNames.push('bloomTex');
        uniformNames.forEach(name => {
            this.uniformLocations[name] = gl.getUniformLocation(this.program, name);
        });
    }

    _compile(type, src) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    _initBuffers() {
        const gl = this.gl;

        // Full screen quad
        const positions = new Float32Array([
            -1, -1,  0, 1,
            1, -1,  1, 1,
            -1,  1,  0, 0,
            1,  1,  1, 0,
        ]);

        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    }

    _initTexture() {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    resize(width, height) {
        this.glCanvas.width = width;
        this.glCanvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }

    _initBloomFBO() {
        const gl = this.gl;
        const w = 256, h = 128; // low-res bloom texture, intentionally blurry

        this.bloomFBOs = [0, 1].map(() => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

            return { fbo, tex, w, h };
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.bloomProgram = this._buildBlurProgram();
        this.bloomSize = { w, h };
    }

    _buildBlurProgram() {
        const gl = this.gl;

        const vert = `
            attribute vec2 a_position;
            attribute vec2 a_uv;
            varying vec2 vUv;
            void main() { vUv = a_uv; gl_Position = vec4(a_position, 0.0, 1.0); }
        `;

        const frag = `
            precision mediump float;
            uniform sampler2D tInput;
            uniform vec2 blurDir;
            varying vec2 vUv;
            const vec3 LUMA = vec3(0.299, 0.587, 0.114);
            void main() {
                float lum = 0.0;
                float s = 1.8; // step multiplier — increase for wider glow
                lum += dot(texture2D(tInput, vUv - blurDir * s * 4.0).rgb, LUMA) * 0.0625;
                lum += dot(texture2D(tInput, vUv - blurDir * s * 3.0).rgb, LUMA) * 0.125;
                lum += dot(texture2D(tInput, vUv - blurDir * s * 2.0).rgb, LUMA) * 0.25;
                lum += dot(texture2D(tInput, vUv - blurDir * s * 1.0).rgb, LUMA) * 0.5;
                lum += dot(texture2D(tInput, vUv                    ).rgb, LUMA) * 1.0;
                lum += dot(texture2D(tInput, vUv + blurDir * s * 1.0).rgb, LUMA) * 0.5;
                lum += dot(texture2D(tInput, vUv + blurDir * s * 2.0).rgb, LUMA) * 0.25;
                lum += dot(texture2D(tInput, vUv + blurDir * s * 3.0).rgb, LUMA) * 0.125;
                lum += dot(texture2D(tInput, vUv + blurDir * s * 4.0).rgb, LUMA) * 0.0625;
                lum /= 2.875;
                gl_FragColor = vec4(lum, lum, lum, 1.0);
            }
        `;

        const prog = gl.createProgram();
        gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vert));
        gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, frag));
        gl.linkProgram(prog);
        return prog;
    }

    _renderBloomPass() {
        const gl = this.gl;
        const { w, h } = this.bloomSize;

        gl.useProgram(this.bloomProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        const posLoc = gl.getAttribLocation(this.bloomProgram, 'a_position');
        const uvLoc = gl.getAttribLocation(this.bloomProgram, 'a_uv');
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

        const inputLoc = gl.getUniformLocation(this.bloomProgram, 'tInput');
        const dirLoc = gl.getUniformLocation(this.bloomProgram, 'blurDir');

        // Horizontal pass: source canvas → FBO[0]
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[0].fbo);
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texture); // source canvas texture
        gl.uniform1i(inputLoc, 1);
        gl.uniform2f(dirLoc, 1.0 / w, 0.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Vertical pass: FBO[0] → FBO[1]
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[1].fbo);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomFBOs[0].tex);
        gl.uniform1i(inputLoc, 1);
        gl.uniform2f(dirLoc, 0.0, 1.0 / h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    render(time) {
        const gl = this.gl;
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
            this.resize(w, h);
        }

        // Upload source canvas as texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);

        // Run bloom passes
        this._renderBloomPass();

        // Main pass
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        const uvLoc = gl.getAttribLocation(this.program, 'a_uv');
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

        // Source canvas on unit 0, bloom texture on unit 1
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.uniformLocations['tDiffuse'], 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomFBOs[1].tex);
        gl.uniform1i(this.uniformLocations['bloomTex'], 1);

        this.uniforms.time = time;
        Object.entries(this.uniforms).forEach(([name, value]) => {
            const loc = this.uniformLocations[name];
            if (loc !== null) gl.uniform1f(loc, value);
        });

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
