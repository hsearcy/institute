"""Original procedural Sunken Vault sound design. Requires Python + NumPy.

No samples, services, or downloaded audio. Rebuild with:
    python scripts/audio/generate_rpg_audio.py
"""
import json
import math
from pathlib import Path
import wave
import numpy as np

RATE=22050
OUT=Path(__file__).resolve().parents[2]/'web/public/assets/rpg/audio'
RNG=np.random.default_rng(214)

def timeline(duration): return np.arange(round(duration*RATE))/RATE

def noise(duration,low=50,high=3500):
    n=round(duration*RATE)
    signal=RNG.normal(0,1,n)
    spectrum=np.fft.rfft(signal)
    freq=np.fft.rfftfreq(n,1/RATE)
    # Gentle band limitation removes harsh digital hiss and sub-bass rumble.
    spectrum*=np.exp(-(freq/high)**4)*(1-np.exp(-(freq/max(low,1))**4))
    result=np.fft.irfft(spectrum,n)
    return result/max(np.std(result),1e-8)

def envelope(t,attack=.008,decay=.25):
    return (1-np.exp(-t/attack))*np.exp(-t/decay)

def tone(duration,freq,end=None,attack=.008,decay=.3,harmonic=.1):
    t=timeline(duration)
    f=freq if end is None else end+(freq-end)*np.exp(-t/max(.05,duration*.18))
    phase=2*np.pi*(t*freq if end is None else np.cumsum(f)/RATE)
    return (np.sin(phase)+harmonic*np.sin(phase*2))*envelope(t,attack,decay)

def layer(dest,signal,at=0,gain=1):
    i=round(at*RATE);n=min(len(signal),len(dest)-i)
    if n>0:dest[i:i+n]+=signal[:n]*gain

def bell(duration,freq,decay=.4):
    t=timeline(duration)
    return sum(amp*np.sin(2*np.pi*freq*ratio*t)*envelope(t,.003,decay/(1+ratio*.2))
               for ratio,amp in [(1,1),(2.01,.25),(2.76,.09),(4.07,.035)])

def room(signal,amount=.12):
    wet=np.copy(signal)
    for seconds,gain in [(.071,.55),(.127,.38),(.193,.24),(.293,.15),(.431,.08)]:
        shift=round(seconds*RATE)
        if shift<len(signal):wet[shift:]+=signal[:-shift]*amount*gain
    return wet

def warmup(dest):
    t=timeline(.22)
    whoosh=noise(.22,180,1800)*np.sin(np.pi*t/.22)**1.6
    layer(dest,whoosh,gain=.08)
    layer(dest,tone(.22,240,480,.055,.18),gain=.075)

def fire():
    d=np.zeros(round(1.9*RATE));warmup(d)
    t=timeline(1.6)
    layer(d,noise(1.6,45,1550)*envelope(t,.008,.31),.22,.36)
    layer(d,tone(1.2,155,51,.004,.20,.25),.22,.78)
    layer(d,tone(.55,360,110,.004,.08),.22,.18)
    # Small ember ticks dissipate after the body of the explosion.
    for i in range(14):
        length=.025+RNG.random()*.055;t=timeline(length)
        layer(d,noise(length,700,2900)*envelope(t,.002,.009),.38+i*.057,.035*(1-i/18))
    return room(d,.2)

def frost():
    d=np.zeros(round(1.8*RATE));warmup(d)
    t=timeline(.7)
    layer(d,noise(.7,300,3300)*envelope(t,.003,.065),.22,.28)
    layer(d,tone(.6,185,85,.005,.1),.22,.34)
    for i in range(13):
        freq=[880,1174.66,1479.98,1760,1318.5][i%5]*(.985+RNG.random()*.03)
        layer(d,bell(.9,freq,.15+RNG.random()*.22),.225+i*.037,.09*(1-i/19))
    layer(d,noise(.95,600,2400)*envelope(timeline(.95),.03,.24),.32,.035)
    return room(d,.32)

def storm():
    d=np.zeros(round(1.85*RATE));warmup(d)
    for i,at in enumerate((.22,.31,.43,.60)):
        t=timeline(.22)
        buzz=noise(.22,170,2600)*envelope(t,.002,.031)
        buzz+=.4*np.sin(2*np.pi*(1800*t-2600*t*t))*envelope(t,.001,.029)
        layer(d,buzz,at,.31*(1-i*.10))
        layer(d,tone(.3,480-i*35,115,.002,.052),at,.13)
    layer(d,tone(1.3,92,47,.012,.30,.15),.25,.49)
    layer(d,noise(1.25,35,480)*envelope(timeline(1.25),.03,.28),.36,.17)
    return room(d,.26)

def loot():
    d=np.zeros(round(1.1*RATE))
    for at,freq,gain in [(0,739.99,.34),(.075,1108.73,.21),(.145,1479.98,.14)]:
        layer(d,bell(.85,freq,.34),at,gain)
    layer(d,noise(.08,900,2300)*envelope(timeline(.08),.002,.009),0,.035)
    return room(d,.25)

def levelup():
    d=np.zeros(round(2.5*RATE))
    for i,freq in enumerate((293.66,369.99,440,587.33,739.99)):
        layer(d,bell(1.7,freq,.8),i*.105,.22 if i<4 else .15)
        layer(d,tone(1.7,freq/2,attack=.08,decay=.65,harmonic=.15),i*.105,.1)
    layer(d,tone(1.5,293.66,attack=.1,decay=.7),.48,.17)
    layer(d,tone(1.5,440,attack=.1,decay=.65),.48,.08)
    return room(d,.32)

def boss():
    d=np.zeros(round(2.65*RATE));t=timeline(1.4)
    layer(d,noise(1.4,40,1000)*envelope(t,.01,.25),0,.30)
    layer(d,tone(1.1,120,42,.003,.26,.1),0,.6)
    for i in range(8):
        duration=.12;t=timeline(duration)
        layer(d,noise(duration,80,1300)*envelope(t,.002,.035),.12+i*.10,.1*(1-i/11))
    for i,freq in enumerate((196,293.66,392,587.33)):
        layer(d,bell(1.65,freq,.85),.36+i*.13,.20)
    return room(d,.32)

def footstep():
    d=np.zeros(round(.28*RATE));t=timeline(.28)
    layer(d,noise(.28,90,1400)*envelope(t,.002,.024),gain=.38)
    layer(d,tone(.2,150,80,.002,.03),gain=.30)
    layer(d,noise(.12,300,1500)*envelope(timeline(.12),.02,.025),.06,.10)
    return room(d,.05)

def ambience():
    duration=12;t=timeline(duration)
    # Integer-period tones and FFT-filtered noise wrap smoothly at the loop seam.
    wind=noise(duration,28,380)*.055
    wind*=.8+.2*np.cos(2*np.pi*t/duration)
    drones=.042*np.sin(2*np.pi*55*t)+.018*np.sin(2*np.pi*82.5*t)
    drones*=.8+.2*np.sin(2*np.pi*t/duration)
    d=wind+drones
    # No ticking or timed gameplay cues during thought: only a far, airy resonance.
    d+=.008*np.sin(2*np.pi*(293+1/3)*t)*(.5+.5*np.cos(2*np.pi*t/duration))
    # FFT noise and every tone above are periodic at exactly twelve seconds.
    return d

OUT.mkdir(parents=True,exist_ok=True)
metadata={}
for name,generator in [('fire-nova',fire),('frost-shatter',frost),('chain-lightning',storm),('loot',loot),('level-up',levelup),('boss-defeat',boss),('footstep',footstep),('dungeon-ambience',ambience)]:
    signal=generator().astype(np.float64)
    signal-=signal.mean()
    if name!='dungeon-ambience':
        # Soft analog saturation; headroom is retained for simultaneous effects.
        signal=np.tanh(signal*1.15)
        signal*=.82/max(abs(signal).max(),1e-8)
        fade=min(round(.018*RATE),len(signal)//4)
        signal[:fade]*=np.linspace(0,1,fade)
        signal[-fade:]*=np.linspace(1,0,fade)
    assert np.isfinite(signal).all() and abs(signal).max()<.99
    pcm=(signal*32767).astype('<i2')
    with wave.open(str(OUT/(name+'.wav')),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm.tobytes())
    metadata[name]={'seconds':round(len(signal)/RATE,3),'peakDbFS':round(20*math.log10(max(abs(signal).max(),1e-8)),2),'rmsDbFS':round(20*math.log10(max(np.sqrt(np.mean(signal**2)),1e-8)),2),'bytes':len(pcm)*2+44}
(OUT/'manifest.json').write_text(json.dumps({'sampleRate':RATE,'format':'mono 16-bit PCM WAV','source':'scripts/audio/generate_rpg_audio.py','license':'Original synthesized audio, no third-party samples','clips':metadata},indent=2)+'\n')
print(json.dumps(metadata,indent=2))
