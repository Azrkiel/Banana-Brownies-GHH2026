import { useState } from 'react';
import { AstronomyArt } from '../components/AstronomyArt';
import { Badge, Button, PageHeader, Surface } from '../components/ui';
import './DesignKit.css';

export default function DesignKit() {
  const [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState('');
  return <main className="design-kit" id="main-content">
    <PageHeader title="Notebook" />
    <AstronomyArt className="kit-astronomy" />
    <div className="kit-grid">
      <Surface><h2>Type</h2><div className="kit-type-display">SignLine</div><p>Earth. Moon. Stars.</p></Surface>
      <Surface><h2>Actions</h2><div className="button-row"><Button variant="primary" onClick={() => setNotice('Selected')}>Begin</Button><Button onClick={() => setNotice('Saved')}>Save</Button><Button disabled>Unavailable</Button></div><p role="status" className="note">{notice}</p></Surface>
      <Surface><h2>Input</h2><label className="field">Name<input placeholder="Your name" /></label><label className="check-field"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Consent</label></Surface>
      <Surface><h2>Status</h2><div className="button-row"><Badge>Standby</Badge><Badge tone="positive">Connected</Badge><Badge tone="warning">Attention</Badge></div></Surface>
    </div>
  </main>;
}
