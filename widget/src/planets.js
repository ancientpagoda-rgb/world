const PLANET_DATA = [
  { name:"Sun", a:0, e:0, i:0, Omega:0, varpi:0, L:0, epoch:0, sun:1, color:[255,220,150] },
  { name:"Mercury", a:0.387099, e:0.205630, i:7.004979, Omega:48.330766, varpi:77.457796, L:252.250324, epoch:"2000-01-01", sun:0, color:[200,200,200] },
  { name:"Venus", a:0.723336, e:0.006772, i:3.394662, Omega:76.679843, varpi:131.563703, L:181.979733, epoch:"2000-01-01", sun:0, color:[240,220,180] },
  { name:"Earth", a:1.000002, e:0.016709, i:-0.000015, Omega:0, varpi:102.937348, L:100.464441, epoch:"2000-01-01", sun:0, color:[100,180,255] },
  { name:"Mars", a:1.523679, e:0.093400, i:1.849726, Omega:49.558093, varpi:336.060234, L:355.462999, epoch:"2000-01-01", sun:0, color:[220,160,100] },
  { name:"Jupiter", a:5.202603, e:0.048498, i:1.303097, Omega:100.473909, varpi:14.056466, L:34.396440, epoch:"2000-01-01", sun:0, color:[240,210,170] },
  { name:"Saturn", a:9.041212, e:0.053862, i:2.488879, Omega:113.665525, varpi:92.598878, L:49.954244, epoch:"2000-01-01", sun:0, color:[230,210,180] },
  { name:"Uranus", a:19.165164, e:0.047318, i:0.773288, Omega:74.006015, varpi:170.954276, L:313.232179, epoch:"2000-01-01", sun:0, color:[180,220,240] },
  { name:"Neptune", a:30.069923, e:0.008590, i:1.769953, Omega:131.784226, varpi:44.969764, L:304.880030, epoch:"2000-01-01", sun:0, color:[160,180,230] },
];

const J2000 = new Date("2000-01-01T12:00:00Z");
const DEG = Math.PI / 180;
const OBLIQUITY = 23.439292 * DEG;

function daysSinceJ2000(date) {
  return (date - J2000) / 86400000;
}

function keplerE(M, e) {
  let E = M;
  for (let i = 0; i < 5; i++) E = M + e * Math.sin(E);
  return E;
}

function heliocentricPos(d, body) {
  const n = 0.9856076686 / (body.a ** 1.5);
  const M = (body.L + n * d) * DEG;
  const E = keplerE(M, body.e);
  const xp = body.a * (Math.cos(E) - body.e);
  const yp = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const ec = body.varpi * DEG;
  const inc = body.i * DEG;
  const Om = body.Omega * DEG;
  const xeh = (Math.cos(ec) * xp - Math.sin(ec) * yp);
  const yeh = (Math.sin(ec) * xp + Math.cos(ec) * yp);
  const x = xeh;
  const y = yeh * Math.cos(inc);
  const z = yeh * Math.sin(inc);
  const xg = x * Math.cos(Om) - y * Math.sin(Om);
  const yg = x * Math.sin(Om) + y * Math.cos(Om);
  return { x: xg, y: yg, z };
}

function eclipticToEq(lon, lat) {
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  const yeq = y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY);
  const zeq = y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  const ra = Math.atan2(yeq, x);
  const dec = Math.atan2(zeq, Math.sqrt(x * x + yeq * yeq));
  return { ra, dec };
}

export function computeCelestialBodies() {
  const now = new Date();
  const d = daysSinceJ2000(now);
  const bodies = [];
  for (const p of PLANET_DATA) {
    if (p.name === "Sun") {
      const ed = heliocentricPos(d, PLANET_DATA[3]);
      const { ra, dec } = eclipticToEq(Math.atan2(-ed.y, -ed.x), 0);
      bodies.push({ ra, dec, s: 12, sun: 1, c: p.color, name: p.name });
      continue;
    }
    // Earth is the observer, not an object in its own geocentric sky. Including it
    // makes dist=0, which produces NaN coordinates and crashes canvas gradients.
    if (p.name === "Earth") continue;
    const pos = heliocentricPos(d, p);
    const earth = heliocentricPos(d, PLANET_DATA[3]);
    const dx = pos.x - earth.x;
    const dy = pos.y - earth.y;
    const dz = pos.z - earth.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const eclLon = Math.atan2(dy, dx);
    const eclLat = Math.asin(dz / dist);
    const { ra, dec } = eclipticToEq(eclLon, eclLat);
    const appSize = p.name === "Sun" ? 12 : p.name === "Moon" ? 8 : Math.max(1.5, 6 / dist);
    bodies.push({ ra, dec, s: appSize, sun: 0, c: p.color, name: p.name });
  }
  return bodies;
}
