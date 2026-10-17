import { useState } from 'react';
import { Badge, Button, Icon, PageHeader, Surface, type ButtonVariant } from '../components/ui';
import './DesignKit.css';

const colors = [
  ['Slate dark', '--color-slate-dark', '#141413'], ['Ivory medium', '--color-ivory-medium', '#f0eee6'],
  ['Ivory light', '--color-ivory-light', '#faf9f5'], ['Stone', '--color-stone', '#cccbc8'],
  ['Oat warm', '--color-oat-warm', '#e3dacc'], ['Manilla', '--color-manilla', '#f5e3c7'],
  ['Clay', '--color-clay', '#d97757'], ['Clay deep', '--color-clay-deep', '#c6613f'],
];
const variants: { name: string; variant: ButtonVariant; label: string }[] = [
  { name: 'Clay action', variant: 'primary', label: 'Continue' },
  { name: 'Outlined', variant: 'secondary', label: 'Customize' },
  { name: 'Text link', variant: 'ghost', label: 'Learn more' },
  { name: 'Destructive', variant: 'danger', label: 'Leave room' },
];
const papers = ['Ivory', 'Manilla', 'Oat'] as const;
type Paper = typeof papers[number];
const descriptions: Record<Paper, string> = {
  Ivory: 'A quiet reading surface, one step lighter than the canvas.',
  Manilla: 'A featured paper tone for a story or an important introduction.',
  Oat: 'A deeper warm surface for related information and grouped controls.',
};

export default function DesignKit() {
  const [paper, setPaper] = useState<Paper>('Manilla');
  const [checked, setChecked] = useState(true);
  const [notice, setNotice] = useState('These examples do not start a call or recording.');
  return <main className="design-kit" id="main-content">
    <PageHeader eyebrow="SIGNLINE / DESIGN SYSTEM" title="Room for the human."
      description="Warm paper, considered typography, and a little space to think. A design system shaped by the supplied Anthropic reference."
      accessory={<Badge>Editorial / 01</Badge>} />
    <section className="kit-material" aria-labelledby="kit-material-title">
      <div className="kit-material__description"><p className="eyebrow">01 / SURFACES</p><h2 id="kit-material-title">A quieter kind of depth.</h2><p>Layers of ivory, manilla, and oat give every thought a place. Fine borders define the edges. The words do the rest.</p>
        <div className="kit-segments" role="group" aria-label="Paper surface">{papers.map(name => <button type="button" aria-pressed={paper === name} onClick={() => setPaper(name)} key={name}>{name}</button>)}</div>
        <p className="kit-caption" role="status">{descriptions[paper]}</p>
      </div>
      <div className={`kit-preview kit-preview--${paper.toLowerCase()}`}>
        <span className="eyebrow">NOTES ON CONNECTION</span>
        <div className="kit-reading-sample"><Icon name="captions" /><h3>Words, in view.</h3><p>A shared space. A different perspective. A little closer to one another.</p></div>
        <span className="kit-preview__label">{paper} paper / Flat surface</span>
      </div>
    </section>
    <Surface aria-labelledby="kit-buttons"><div className="panel-heading"><div><p className="eyebrow">02 / ACTIONS</p><h2 id="kit-buttons">Every action has its place.</h2></div><span className="kit-caption">44 px minimum touch target</span></div>
      <div className="kit-buttons">{variants.map(({name, variant, label}) => <div key={variant}><span className="kit-label">{name}</span><Button variant={variant} onClick={() => setNotice(`${name} selected.`)}>{label}<Icon name="arrow" /></Button><Button variant={variant} disabled>Unavailable</Button></div>)}</div>
      <p className="kit-feedback" role="status">{notice}</p>
    </Surface>
    <div className="kit-grid">
      <Surface aria-labelledby="kit-type"><p className="eyebrow">03 / TYPOGRAPHY</p><h2 id="kit-type">Two voices. One conversation.</h2><div className="kit-type-display">Hello, you.</div><div className="kit-type-title">A space to connect.</div><p>Serif gives the words a human voice. Sans-serif makes the controls clear and familiar.</p><p className="kit-caption">Serif body / 20 · Sans controls / 16 · Serif display / 68 · Sans display / 61</p></Surface>
      <Surface aria-labelledby="kit-controls"><p className="eyebrow">04 / INPUT</p><h2 id="kit-controls">Clear, everyday choices.</h2><div className="kit-fields"><label className="field">Display name<input placeholder="e.g. Kev" /></label><label className="field">Joining as<select defaultValue="signer"><option value="signer">Signer</option><option value="hearing">Hearing participant</option></select></label><label className="check-field"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>Clear choices, with room to tap.</span></label></div></Surface>
    </div>
    <Surface aria-labelledby="kit-color"><div className="panel-heading"><div><p className="eyebrow">05 / PALETTE</p><h2 id="kit-color">Paper, ink, and a touch of clay.</h2></div><span className="kit-caption">Clay is reserved for the primary action</span></div><div className="kit-colors">{colors.map(([name, token, hex]) => <div key={token}><div className="kit-swatch" style={{ background: `var(${token})` }} /><strong>{name}</strong><span className="kit-caption">{hex}</span><code>{token}</code></div>)}</div></Surface>
    <div className="kit-grid">
      <Surface aria-labelledby="kit-status"><p className="eyebrow">06 / FEEDBACK</p><h2 id="kit-status">Status, in plain words.</h2><div className="button-row"><Badge>Standby</Badge><Badge tone="positive">Connected</Badge><Badge tone="warning">Needs attention</Badge></div><p className="kit-caption">Labels and distinct indicators carry meaning without relying on color. Destructive actions are named explicitly.</p></Surface>
      <Surface aria-labelledby="kit-access"><p className="eyebrow">07 / ACCESS</p><h2 id="kit-access">Comfort comes first.</h2><p>Visible keyboard focus. Readable contrast. Generous touch targets. Layouts that reflow with the words.</p><p className="kit-caption">The reference is a light theme. System high-contrast and reduced-motion preferences remain supported.</p></Surface>
    </div>
    <footer className="kit-footer"><div><span className="eyebrow">SIGNLINE / EDITORIAL DESIGN SYSTEM</span><p>Built around the conversation.</p></div><a href="#/conversation">Back to conversation <Icon name="arrow" /></a></footer>
  </main>;
}
