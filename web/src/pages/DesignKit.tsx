import { useState } from 'react';
import { Badge, Button, Icon, PageHeader, Surface, type ButtonVariant } from '../components/ui';
import './DesignKit.css';

const colors = [
  ['Accent', '--color-accent'], ['Text', '--color-ink'],
  ['Secondary text', '--color-muted'], ['Canvas', '--color-canvas'],
  ['Success', '--color-positive'], ['Caution', '--color-warning'],
  ['Destructive', '--color-danger'], ['Reading surface', '--color-surface'],
];
const variants: ButtonVariant[] = ['primary', 'secondary', 'glass', 'danger'];
const materials = ['Regular', 'Clear', 'Content'] as const;
type Material = typeof materials[number];
const descriptions: Record<Material, string> = {
  Regular: 'The default for navigation and controls. Background detail softens while the foreground stays clear.',
  Clear: 'Reserved for controls over rich media. A 35% dark scrim protects this example’s white foreground.',
  Content: 'Reading surfaces stay stable and opaque. Captions, consent, and settings do not need a glass effect.',
};

export default function DesignKit() {
  const [material, setMaterial] = useState<Material>('Regular');
  const [checked, setChecked] = useState(true);
  const [notice, setNotice] = useState('These examples do not start a call or recording.');
  return <main className="design-kit" id="main-content">
    <PageHeader eyebrow="SIGNLINE / DESIGN SYSTEM" title="A material with a purpose."
      description="Content comes first. Glass gives navigation and controls a distinct layer above it."
      accessory={<Badge>Glass · 2.0</Badge>} />
    <section className="kit-material" aria-labelledby="kit-material-title">
      <div className="kit-material__description"><p className="eyebrow">MATERIALS</p><h2 id="kit-material-title">A clear sense of place.</h2><p>Use glass where you interact. Keep the words you’re reading on a quiet, stable surface.</p>
        <div className="kit-segments" role="group" aria-label="Material example">{materials.map(name => <button type="button" aria-pressed={material === name} onClick={() => setMaterial(name)} key={name}>{name}</button>)}</div>
        <p className="kit-caption" role="status">{descriptions[material]}</p>
      </div>
      <div className={`kit-preview kit-preview--${material.toLowerCase()}`}>
        <div className="kit-preview__content" aria-hidden="true"><span /><span /><span /></div>
        {material === 'Content' ? <div className="kit-reading-sample"><Icon name="captions" /><h3>Words, in view.</h3><p>A stable surface keeps a conversation easy to follow.</p></div> : <button type="button" className={`kit-demo-control glass ${material === 'Clear' ? 'glass--clear' : ''}`} onClick={() => setNotice(`${material} glass example selected.`)}><Icon name="video" />Conversation<Icon name="arrow" /></button>}
        <span className="kit-preview__label">Illustrative backdrop · {material.toLowerCase()} material</span>
      </div>
    </section>
    <Surface aria-labelledby="kit-buttons"><div className="panel-heading"><h2 id="kit-buttons">Controls, with intention.</h2><span className="kit-caption">44 px minimum touch target</span></div>
      <div className="kit-buttons">{variants.map(variant => <div key={variant}><span className="kit-label">{variant}</span><Button variant={variant} onClick={() => setNotice(`${variant[0].toUpperCase() + variant.slice(1)} button selected.`)}><Icon name={variant === 'danger' ? 'record' : 'arrow'} />{variant === 'danger' ? 'Leave room' : 'Continue'}</Button><Button variant={variant} disabled>Unavailable</Button></div>)}</div>
      <p className="kit-feedback" role="status">{notice}</p>
    </Surface>
    <div className="kit-grid">
      <Surface aria-labelledby="kit-type"><p className="eyebrow">SYSTEM TYPOGRAPHY</p><h2 id="kit-type">Room for the words.</h2><div className="kit-type-display">Hello, you.</div><div className="kit-type-title">A space to connect</div><p>Comfortable reading, a clear hierarchy, and the system font on your device.</p><p className="kit-caption">Body / 16 · Controls / 14 · Page title / 28–36 · Live captions / 18</p></Surface>
      <Surface aria-labelledby="kit-controls"><h2 id="kit-controls">Everyday controls</h2><div className="kit-fields"><label className="field">Display name<input placeholder="e.g. Kev" /></label><label className="field">Joining as<select defaultValue="signer"><option value="signer">Signer</option><option value="hearing">Hearing participant</option></select></label><label className="check-field"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>Clear choices, with room to tap.</span></label></div></Surface>
    </div>
    <Surface aria-labelledby="kit-color"><div className="panel-heading"><h2 id="kit-color">Color follows meaning.</h2><span className="kit-caption">Adapts to light and dark appearance</span></div><div className="kit-colors">{colors.map(([name, token]) => <div key={token}><div className="kit-swatch" style={{ background: `var(${token})` }} /><strong>{name}</strong><code>{token}</code></div>)}</div></Surface>
    <div className="kit-grid">
      <Surface aria-labelledby="kit-status"><h2 id="kit-status">Status, beyond color.</h2><div className="button-row"><Badge>Standby</Badge><Badge tone="positive">Connected</Badge><Badge tone="warning">Needs attention</Badge></div><p className="kit-caption">Pair color with a clear label. Selection, errors, and connection states always have a text equivalent.</p></Surface>
      <Surface aria-labelledby="kit-access"><span className="icon-well"><Icon name="shield" /></span><h2 id="kit-access">Comfort comes first.</h2><p>Visible keyboard focus. Reduced motion and transparency. High-contrast fallbacks. Use the appearance control in the header to choose Auto, Light, or Dark.</p><p className="kit-caption">Web materials interpret the design guidance; they do not use Apple’s native Liquid Glass renderer.</p></Surface>
    </div>
    <footer className="kit-footer"><span>SignLine / Glass design kit</span><a href="https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass" target="_blank" rel="noreferrer">Apple’s Liquid Glass guidance ↗</a></footer>
  </main>;
}
