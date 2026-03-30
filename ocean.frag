#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_bg;
uniform sampler2D u_mask;

void main() {
	// p5's vTexCoord is already in the correct orientation for textures here.
	vec2 uv = vTexCoord;

	vec4 mask = texture2D(u_mask, uv);
	float m = mask.a;

	// Bands (tuned for a "grey sides, jelly center" floater look).
	float edgeBand = smoothstep(0.04, 0.14, m) * (1.0 - smoothstep(0.22, 0.45, m));
	float centerBand = smoothstep(0.16, 0.55, m);
	float overlapBand = smoothstep(0.65, 0.98, m); // where multiple strokes overlap

	// Gradient of the mask (approx normal) for refraction direction.
	vec2 px = 1.0 / u_resolution;
	float mx1 = texture2D(u_mask, uv + vec2(px.x, 0.0)).a;
	float mx0 = texture2D(u_mask, uv - vec2(px.x, 0.0)).a;
	float my1 = texture2D(u_mask, uv + vec2(0.0, px.y)).a;
	float my0 = texture2D(u_mask, uv - vec2(0.0, px.y)).a;
	vec2 grad = vec2(mx1 - mx0, my1 - my0);

	// Overall "defocus" blur (when focusing on floaters, the world softens).
	// Make it clearly visible even with no floaters present.
	vec4 bg = texture2D(u_bg, uv);
	float defocus = 0.85;
	vec2 d = px * 7.5;

	// Matte-ish lens blur: weighted taps (less "censored box blur" feeling).
	vec4 bgBlur = vec4(0.0);
	float w = 0.0;
	bgBlur += texture2D(u_bg, uv) * 0.22; w += 0.22;

	bgBlur += texture2D(u_bg, uv + vec2( d.x, 0.0)) * 0.11; w += 0.11;
	bgBlur += texture2D(u_bg, uv + vec2(-d.x, 0.0)) * 0.11; w += 0.11;
	bgBlur += texture2D(u_bg, uv + vec2(0.0,  d.y)) * 0.11; w += 0.11;
	bgBlur += texture2D(u_bg, uv + vec2(0.0, -d.y)) * 0.11; w += 0.11;

	bgBlur += texture2D(u_bg, uv + vec2( d.x,  d.y)) * 0.07; w += 0.07;
	bgBlur += texture2D(u_bg, uv + vec2(-d.x,  d.y)) * 0.07; w += 0.07;
	bgBlur += texture2D(u_bg, uv + vec2( d.x, -d.y)) * 0.07; w += 0.07;
	bgBlur += texture2D(u_bg, uv + vec2(-d.x, -d.y)) * 0.07; w += 0.07;

	bgBlur += texture2D(u_bg, uv + vec2(2.0 * d.x, 0.0)) * 0.04; w += 0.04;
	bgBlur += texture2D(u_bg, uv + vec2(-2.0 * d.x, 0.0)) * 0.04; w += 0.04;
	bgBlur += texture2D(u_bg, uv + vec2(0.0, 2.0 * d.y)) * 0.04; w += 0.04;
	bgBlur += texture2D(u_bg, uv + vec2(0.0, -2.0 * d.y)) * 0.04; w += 0.04;

	bgBlur /= max(w, 0.0001);
	vec4 bgDefocus = mix(bg, bgBlur, defocus);

	// Exaggerated "jelly" refraction + slight drift (mostly in the center).
	float wobble = 0.35 + 0.15 * sin(u_time * 1.2);
	vec2 refractOffset = grad * (0.022 * wobble) * centerBand;
	vec2 uvRefract = uv + refractOffset;

	// Local blur: strongest in center, but overlaps get *clearer/lighter*.
	float blurAmt = mix(0.0065, 0.0025, overlapBand) * centerBand;
	vec4 c = vec4(0.0);
	c += texture2D(u_bg, uvRefract + vec2(-blurAmt, -blurAmt));
	c += texture2D(u_bg, uvRefract + vec2( blurAmt, -blurAmt));
	c += texture2D(u_bg, uvRefract + vec2(-blurAmt,  blurAmt));
	c += texture2D(u_bg, uvRefract + vec2( blurAmt,  blurAmt));
	c += texture2D(u_bg, uvRefract);
	c /= 5.0;

	// Grey-ish sides, transparent/jelly center.
	// - edgeBand darkens slightly (grey sides)
	// - centerBand mainly refracts/blurs, with minimal darkening
	// - overlapBand reduces darkening and blur to look clearer/lighter
	float edgeDarken = 0.35 * edgeBand * (1.0 - 0.70 * overlapBand);
	float centerDarken = 0.06 * centerBand * (1.0 - 0.85 * overlapBand);
	float darken = clamp(edgeDarken + centerDarken, 0.0, 0.45);

	// Slight lift in overlaps (clearer mixing).
	vec3 lifted = mix(c.rgb, c.rgb + vec3(0.04), overlapBand * centerBand);
	vec3 floaterColor = lifted * (1.0 - darken);

	// Composite: defocused background everywhere, floater effect on top.
	float floaterMix = smoothstep(0.03, 0.20, m);
	vec3 outColor = mix(bgDefocus.rgb, floaterColor, floaterMix);
	gl_FragColor = vec4(outColor, 1.0);
}
