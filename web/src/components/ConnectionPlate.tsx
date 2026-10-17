/** An original line illustration, using only the reference's paper and ink tokens. */
export function ConnectionPlate() {
  return <svg className="connection-plate" viewBox="0 0 520 440" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1">
      <path d="M40 220h440M260 30v380" strokeDasharray="3 7" opacity=".35" />
      <circle cx="260" cy="220" r="165" />
      <circle cx="260" cy="220" r="146" opacity=".3" />
      <ellipse cx="260" cy="220" rx="88" ry="165" />
      <ellipse cx="260" cy="220" rx="32" ry="165" />
      <ellipse cx="260" cy="220" rx="165" ry="54" />
      <path d="M118 137c86 43 198 43 284 0M118 303c86-43 198-43 284 0" />
      <ellipse cx="260" cy="220" rx="225" ry="76" transform="rotate(-28 260 220)" strokeWidth="1.5" />
      <path d="m83 156 10-8m334 145 10-8M254 43h12m-12 354h12" />
    </g>
    <g fill="var(--color-feature)" stroke="currentColor" strokeWidth="1.5">
      <circle cx="77" cy="268" r="22" /><circle cx="443" cy="171" r="22" />
    </g>
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M67 263h20m-20 5h14m-14 5h17M433 166h20m-20 5h14m-14 5h17" />
    </g>
    <g fill="currentColor">
      <circle cx="260" cy="55" r="3" /><circle cx="260" cy="385" r="3" />
      <circle cx="113" cy="295" r="3" /><circle cx="406" cy="145" r="3" />
    </g>
  </svg>;
}
