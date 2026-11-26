class UmGoblin extends HTMLElement {
  static observedAttributes = ['rate', 'playing'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{display:block;width:var(--goblin-width,205px);height:var(--goblin-height,190px);animation:float 3s ease-in-out infinite;transform-origin:50% 85%}
      svg{display:block;width:100%;height:100%;overflow:visible}
      .body{transform-origin:120px 180px;transform:scale(var(--fat),var(--bulk));animation:breathe 2.7s ease-in-out infinite;filter:drop-shadow(0 9px 8px #05070566)}
      .snacks text{font:italic 12px Georgia,serif;fill:#b8e66d;animation:snack 2.3s ease-in-out infinite}
      .snacks text:nth-child(2){animation-delay:.8s}.snacks text:nth-child(3){animation-delay:1.2s}
      .mouth-open{display:none}.mouth-line{fill:none;stroke:#376332;stroke-width:5;stroke-linecap:round}
      :host([playing]) .mouth-line{display:none}:host([playing]) .mouth-open{display:block;animation:talk .2s infinite alternate;transform-origin:120px 150px}
      @keyframes float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-7px) rotate(1deg)}}
      @keyframes breathe{0%,100%{scale:1}50%{scale:1.015 1.025}}
      @keyframes snack{0%,100%{translate:0 0;opacity:.75}50%{translate:0 -9px;opacity:1}}
      @keyframes talk{to{scale:1 1.4}}
      @media(prefers-reduced-motion:reduce){:host,.body,.snacks text{animation:none}}
    </style>
    <svg viewBox="0 0 240 220" role="img" aria-label="Hungry goblin">
      <defs><radialGradient id="skin" cx="35%" cy="25%"><stop stop-color="#cff176"/><stop offset="1" stop-color="#79b64d"/></radialGradient></defs>
      <ellipse cx="120" cy="197" rx="65" ry="9" fill="#070907" opacity=".4"/>
      <g class="body"><path d="M69 82 21 54q-11-7-11 5l8 39 49 7m104-23 48-28q11-7 11 5l-8 39-49 7" fill="#93cd59" stroke="#4f8b3e" stroke-width="4" stroke-linejoin="round"/><path d="M65 90q4-37 55-39 53 2 57 39l-5 68q-20 24-51 24t-51-24z" fill="url(#skin)" stroke="#4f8b3e" stroke-width="4"/><path d="M79 123q15-15 30 0-15 11-30 0m52 0q15-15 30 0-15 11-30 0" fill="#fff8dc"/><ellipse cx="95" cy="124" rx="4" ry="6" fill="#253424"/><ellipse cx="147" cy="124" rx="4" ry="6" fill="#253424"/><path class="mouth-line" d="M106 151q14 12 28 0"/><ellipse class="mouth-open" cx="120" cy="152" rx="9" ry="5" fill="#376332"/><path d="m114 148 6 12 6-12" fill="#fff2cf"/><circle cx="76" cy="144" r="5" fill="#f28f71" opacity=".7"/><circle cx="164" cy="144" r="5" fill="#f28f71" opacity=".7"/><path d="M95 93q12-8 22 0m8 0q12-8 22 0" fill="none" stroke="#527e3b" stroke-width="5" stroke-linecap="round"/><path d="M102 53q5-21 19-22 12 0 16 21" fill="#a2d866" stroke="#4f8b3e" stroke-width="4"/></g>
      <g class="snacks"><text x="31" y="100">um</text><text x="183" y="80">uh</text><text x="172" y="164">um</text></g>
    </svg>`;
    this.update();
  }

  attributeChangedCallback() { this.update(); }

  update() {
    const rate = Math.max(0, Math.min(25, Number(this.getAttribute('rate') || 0)));
    const fullness = rate / 25;
    this.style.setProperty('--fat', (0.78 + fullness * 0.36).toFixed(2));
    this.style.setProperty('--bulk', (0.79 + fullness * 0.24).toFixed(2));
    this.setAttribute('mood', rate < 2 ? 'starving' : rate < 8 ? 'peckish' : 'well-fed');
    const mouth = this.shadowRoot?.querySelector('.mouth-line');
    if (mouth) mouth.setAttribute('d', rate < 2 ? 'M104 150 Q120 138 136 150' : rate < 8 ? 'M105 150 Q120 147 135 150' : 'M102 147 Q120 164 138 147');
  }
}

customElements.define('um-goblin', UmGoblin);
