import { useState } from 'react';
import { Badge, Button, Icon, PageHeader, Surface, type ButtonVariant } from '../components/ui';
import './DesignKit.css';

const colors = [
  ['Accent', '--color-accent', '#005BC8'], ['Ink', '--color-ink', '#18243B'],
  ['Secondary text', '--color-muted', '#53627B'], ['Canvas', '--color-canvas', '#F3F6FC'],
  ['Success', '--color-positive', '#176C51'], ['Caution', '--color-warning', '#80521A'],
  ['Destructive', '--color-danger', '#B1273D'], ['Surface', '--color-surface', '#FFFFFF'],
];
const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];

export default function DesignKit() {
  const [selected, setSelected] = useState('Surfaces');
  const [checked, setChecked] = useState(true);
  const [notice, setNotice] = useState('Try a button to see its feedback.');
  return <main className="design-kit" id="main-content">
    <PageHeader eyebrow="SIGNLINE / DESIGN SYSTEM" title="A little clarity. A little glass."
      description="One shared visual language for every conversation. Explore the materials, type, colors, and controls that shape SignLine."
      accessory={<Badge>Glass · 1.0</Badge>} />
    <div className="kit-material glass">
      <div><p className="eyebrow">THE MATERIAL</p><h2>Light finds its way.</h2><p>Translucent navigation and controls float above a quiet canvas. Content stays readable, grounded, and easy to follow.</p></div>
      <div className="kit-material__sample glass"><Icon name="sparkles" /><span>Room to connect</span></div>
    </div>
    <Surface aria-labelledby="kit-buttons"><div className="panel-heading"><h2 id="kit-buttons">Buttons</h2><span className="kit-caption">44 px minimum touch target</span></div>
      <div className="kit-buttons">{variants.map(variant => <div key={variant}><span className="kit-label">{variant}</span><Button variant={variant} onClick={() => setNotice(`${variant[0].toUpperCase() + variant.slice(1)} button selected.`)}><Icon name={variant === 'danger' ? 'record' : 'arrow'} />{variant === 'danger' ? 'Leave room' : 'Continue'}</Button><Button variant={variant} disabled>Unavailable</Button></div>)}</div>
      <p className="kit-feedback" role="status">{notice}</p>
    </Surface>
    <div className="kit-grid">
      <Surface aria-labelledby="kit-type"><p className="eyebrow">SYSTEM FONT STACK</p><h2 id="kit-type">Type, with purpose.</h2><div className="kit-type-display">Hello, you.</div><div className="kit-type-title">A space to connect</div><p>Clear words. Comfortable reading. System fonts feel at home on every device, without an extra download.</p><p className="kit-caption">Caption / 12 · Body / 16 · Title / 32–48 · Display / 52–72</p></Surface>
      <Surface aria-labelledby="kit-controls"><h2 id="kit-controls">Everyday controls</h2><div className="kit-fields"><label className="field">Display name<input placeholder="e.g. Kev" /></label><label className="field">Joining as<select defaultValue="signer"><option value="signer">Signer</option><option value="hearing">Hearing participant</option></select></label><label className="check-field"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>Clear choices, with room to tap.</span></label></div></Surface>
    </div>
    <Surface aria-labelledby="kit-color"><div className="panel-heading"><h2 id="kit-color">A calm palette.</h2><span className="kit-caption">Semantic color tokens</span></div><div className="kit-colors">{colors.map(([name, token, hex]) => <div key={token}><div className="kit-swatch" style={{ background: `var(${token})` }} /><strong>{name}</strong><span>{hex}</span><code>{token}</code></div>)}</div></Surface>
    <div className="kit-grid">
      <Surface aria-labelledby="kit-status"><h2 id="kit-status">Status, beyond color.</h2><div className="button-row"><Badge>Standby</Badge><Badge tone="positive">Connected</Badge><Badge tone="warning">Needs attention</Badge></div><p className="kit-caption">Pair color with a clear label. Keep live captions on stable, high-contrast surfaces.</p><div className="kit-segments" role="group" aria-label="Example material selection">{['Surfaces', 'Controls', 'Content'].map(label => <Button size="small" variant={selected === label ? 'secondary' : 'ghost'} aria-pressed={selected === label} onClick={() => setSelected(label)} key={label}>{label}</Button>)}</div><p className="kit-caption" role="status">Showing {selected.toLowerCase()} styling.</p></Surface>
      <Surface aria-labelledby="kit-access"><span className="icon-well"><Icon name="shield" /></span><h2 id="kit-access">Comfort comes first.</h2><p>Visible keyboard focus. Reduced motion. Opaque surfaces when transparency is reduced. Stronger borders when more contrast is requested.</p><p className="kit-caption">Blur is an enhancement. Every control works without it.</p></Surface>
    </div>
    <footer className="kit-footer"><span>SignLine / Glass design kit</span><a href="https://developer.apple.com/documentation/technologyoverviews/liquid-glass" target="_blank" rel="noreferrer">Liquid Glass reference ↗</a></footer>
  </main>;
}
