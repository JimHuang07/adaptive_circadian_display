import { useState } from 'react'

const screens = ['Home', 'Social', 'Productivity'] as const
const apps = [
  ['☀', 'Weather', '#3b89da'], ['◉', 'Camera', '#696385'], ['♫', 'Music', '#ed4b76'],
  ['▣', 'Notes', '#f7a727'], ['✿', 'Photos', '#e8723f'], ['⌖', 'Maps', '#31a781'],
  ['◷', 'Clock', '#45446f'], ['✉', 'Mail', '#4281e5'], ['♥', 'Health', '#e25278'],
  ['✦', 'Explore', '#8470d0'], ['✓', 'Tasks', '#46a97e'], ['▦', 'Calendar', '#ec6963'],
]
const tasks = [
  ['09:00', 'Design review', 'Studio', '#7756d7'],
  ['11:30', 'Research notes', 'Focus', '#237da2'],
  ['14:00', 'Project planning', 'Work', '#de8051'],
  ['17:00', 'Daily wrap-up', 'Personal', '#368b62'],
]

export function Phone({ time, saturation }: { time: string; saturation: number }) {
  const [screen, setScreen] = useState<typeof screens[number]>('Home')
  const [liked, setLiked] = useState(false)
  const [done, setDone] = useState<string[]>([])
  return <>
    <div className="screen-switch" aria-label="Phone screen">
      {screens.map(s => <button key={s} aria-pressed={screen === s} onClick={() => setScreen(s)}>{s}</button>)}
    </div>
    <div className="phone">
      <div className={'phone-display ' + (screen === 'Home' ? 'wallpaper' : '')} style={{ filter: 'saturate(' + saturation / 100 + ')' }}>
        <div className="phone-status"><b>{time}</b><span aria-hidden="true">▮▮▮ ▰</span></div>
        <div className="camera" aria-hidden="true" />
        {screen === 'Home' && <div className="phone-content home">
          <div className="weather"><span aria-hidden="true">☀</span><div><strong>23°</strong><small>Partly sunny</small></div></div>
          <div className="apps">{apps.map(([icon, name, color]) => <div key={name}><span style={{ background: color }}>{icon}</span><small>{name}</small></div>)}</div>
          <div className="dock"><span>☎</span><span>◈</span><span>✉</span></div>
        </div>}
        {screen === 'Social' && <div className="phone-content feed">
          <h3>Fieldnotes <span>2</span></h3>
          <div className="author"><span>ML</span><div><b>Maya Linwood</b><small>Weekend trails</small></div></div>
          <div className="landscape" role="img" aria-label="Illustration of a colorful mountain landscape"><i /><i /><i /></div>
          <button aria-pressed={liked} onClick={() => setLiked(!liked)}>{liked ? '♥' : '♡'} {liked ? 125 : 124} likes</button>
          <p>Morning light on the ridge. Glad we took the long way.</p>
          <p><b>Jordan</b> That is a beautiful view!</p>
          <div className="author"><span>AR</span><div><b>Alex Rivera</b><small>From the studio</small></div></div>
        </div>}
        {screen === 'Productivity' && <div className="phone-content productivity">
          <h3>Today</h3>
          <p>Wednesday, November 18</p>
          <div className="week">{['M','T','W','T','F','S','S'].map((d,i) => <div key={i}>{d}<b className={i === 2 ? 'today' : ''}>{16+i}</b></div>)}</div>
          <div className="tasks">{tasks.map(([at, name, type, color]) => <label key={name} style={{ borderColor: color }}>
            <input type="checkbox" checked={done.includes(name)} onChange={e => setDone(e.target.checked ? [...done, name] : done.filter(t => t !== name))} />
            <span><b>{name}</b><small>{at} · {type}</small></span>
          </label>)}</div>
          <div className="mini-chart" aria-label="Focus time chart">{[35, 55, 40, 75, 62, 90, 50].map((h,i) => <i key={i} style={{ height: h + '%' }} />)}</div>
        </div>}
        <div className="home-bar" aria-hidden="true" />
      </div>
    </div>
  </>
}
