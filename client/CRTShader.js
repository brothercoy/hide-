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
            adaptiveIntensity: 5.0,
            vignetteStrength: 0.45,
            curvature: 0.15,
            flickerStrength: 0.03
        };

        this._initShader();
        this._initBuffers();
        this._initTexture();
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
                vec4 c = vec4(0.0);
                float r1 = radius;
                float r2 = radius * 2.5;
                float r3 = radius * 5.0;
                c += texture2D(tex, uv + vec2(r1,  0.0)) * 0.12;
                c += texture2D(tex, uv - vec2(r1,  0.0)) * 0.12;
                c += texture2D(tex, uv + vec2(0.0,  r1)) * 0.12;
                c += texture2D(tex, uv - vec2(0.0,  r1)) * 0.12;
                c += texture2D(tex, uv + vec2(r2,  0.0)) * 0.08;
                c += texture2D(tex, uv - vec2(r2,  0.0)) * 0.08;
                c += texture2D(tex, uv + vec2(0.0,  r2)) * 0.08;
                c += texture2D(tex, uv - vec2(0.0,  r2)) * 0.08;
                c += texture2D(tex, uv + vec2(r3,  0.0)) * 0.04;
                c += texture2D(tex, uv - vec2(r3,  0.0)) * 0.04;
                c += texture2D(tex, uv + vec2(0.0,  r3)) * 0.04;
                c += texture2D(tex, uv - vec2(0.0,  r3)) * 0.04;
                return c;
            }

            float vignetteApprox(vec2 uv, float strength) {
                vec2 vigCoord = uv * 2.0 - 1.0;
                float dist = max(abs(vigCoord.x), abs(vigCoord.y));
                return 1.0 - dist * dist * strength;
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
                    vec4 bloomSample = sampleBloom(tDiffuse, uv, 0.01, pixel);
                    vec4 brightPart = max(bloomSample - vec4(bloomThreshold), vec4(0.0));
                    pixel.rgb += brightPart.rgb * bloomIntensity;
                }

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

                if (vignetteStrength > 0.001) {
                    lightingMask *= vignetteApprox(uv, vignetteStrength);
                }

                pixel.rgb *= lightingMask;
                pixel.rgb += vec3(0.0, 0.08, 0.018);
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

    render(time) {
        const gl = this.gl;
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
            this.resize(w, h);
        }

        // Upload source canvas as texture
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);

        gl.useProgram(this.program);

        // Bind buffer and set attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        const uvLoc = gl.getAttribLocation(this.program, 'a_uv');
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

        // Set uniforms
        gl.uniform1i(this.uniformLocations['tDiffuse'], 0);
        this.uniforms.time = time;
        Object.entries(this.uniforms).forEach(([name, value]) => {
            const loc = this.uniformLocations[name];
            if (loc !== null) gl.uniform1f(loc, value);
        });

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
