// Hand-drawn robot, origin at the feet, about 470 px tall. Shared by the video and the carousel.
export const INK = '#1d1d3a';
export function robot(p = 'r') {
  const leg = (s) => `<g id="${p}-leg${s < 0 ? 'L' : 'R'}" transform="translate(${s * 38},-92)"><rect x="-17" y="0" width="34" height="72" rx="15" fill="#4a5cc9" stroke="${INK}" stroke-width="8"/><ellipse cx="${s * 6}" cy="78" rx="34" ry="17" fill="#ffb703" stroke="${INK}" stroke-width="8"/></g>`;
  const arm = (s) => `<g id="${p}-arm${s < 0 ? 'L' : 'R'}" transform="translate(${s * 80},-215)"><line x1="0" y1="0" x2="0" y2="100" stroke="${INK}" stroke-width="40" stroke-linecap="round"/><line x1="0" y1="0" x2="0" y2="100" stroke="#5b7cff" stroke-width="24" stroke-linecap="round"/><circle cx="0" cy="112" r="27" fill="#ffb703" stroke="${INK}" stroke-width="8"/></g>`;
  return `<g id="${p}-root">
${leg(-1)}${leg(1)}
<rect x="-78" y="-250" width="156" height="170" rx="46" fill="#5b7cff" stroke="${INK}" stroke-width="8"/>
<rect x="-44" y="-212" width="88" height="68" rx="22" fill="#cfe0ff"/><circle cx="0" cy="-178" r="15" fill="#ff5d73"/>
${arm(-1)}${arm(1)}
<g id="${p}-head" transform="translate(0,-330)">
<line x1="0" y1="-80" x2="0" y2="-118" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><circle cx="0" cy="-130" r="17" fill="#ff5d73" stroke="${INK}" stroke-width="8"/>
<rect x="-122" y="-26" width="30" height="52" rx="14" fill="#ffb703" stroke="${INK}" stroke-width="8"/><rect x="92" y="-26" width="30" height="52" rx="14" fill="#ffb703" stroke="${INK}" stroke-width="8"/>
<rect x="-100" y="-80" width="200" height="160" rx="58" fill="#f4f7ff" stroke="${INK}" stroke-width="8"/>
<g id="${p}-eyes"><circle cx="-40" cy="-8" r="27" fill="${INK}"/><circle cx="40" cy="-8" r="27" fill="${INK}"/><circle cx="-31" cy="-17" r="9" fill="#fff"/><circle cx="49" cy="-17" r="9" fill="#fff"/></g>
<circle cx="-64" cy="34" r="13" fill="#ff9eb0"/><circle cx="64" cy="34" r="13" fill="#ff9eb0"/>
<path id="${p}-smile" d="M-26 30 Q0 58 26 30" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
<ellipse id="${p}-oh" cx="0" cy="42" rx="17" ry="21" fill="${INK}" style="display:none"/>
</g></g>`;
}
