# Headcar, AI Meetup talk, DRAFT v2 (car-forward) — rough

> Alternate take, does NOT replace `MEETUP_TALK.md`. Same inspirational soul, but:
> the **car is clearly the showcased project**, there's **more car in the first half**,
> "I can't code" is said **once** (not three times), and it runs **a bit longer (~10:45)**.
> Written with commas (no em-dashes) to match your edit. Slides/demo/rehearsal notes in
> the main doc still apply (you'd add one car slide for the new beat 2/3).

**One-liner:** *I built a car you drive with your face, Headcar, and the story of building
it is the story of why anyone can start building right now.*

---

## Beat sheet (~10:45)

| # | Beat | Time |
|---|------|------|
| 1 | Hook, drive a car with your face | 0:45 |
| 2 | Meet the car (what Headcar is) | 2:00 |
| 3 | How it actually works | 2:00 |
| 4 | How I built it (Iron Man, builder's era, vibe-coding) | 1:30 |
| 5 | The build was a comedy of problems | 1:30 |
| 6 | **LIVE DEMO** | 2:00 |
| 7 | Takeaway + close | 1:00 |

---

## 1 · Hook (0:45)
*(car in hand, no remote)*
> "In a few minutes, I'm going to drive this car across the room, with my face. *(pause, hold
> it up)* No remote, no app. I call it Headcar, and I built it in about two months by
> vibe-coding it. *(beat)* But let me show you what it actually is, because it's stranger and
> simpler than 'brain-controlled car' makes it sound."

## 2 · Meet the car (2:00)  ← the project, front and centre
> "This is Headcar: a four-wheel-drive car you drive with your face. The headband is a Muse, an
> EEG headset meant for meditation. I've mapped it to three controls:
>
> Clench your jaw, and it drives forward, and the harder you clench, the faster it goes.
> Raise your eyebrows, and it reverses. Tilt your head, and it steers.
>
> Now the honest part, because 'brain-controlled' oversells it: it is not reading my thoughts.
> It's reading the tiny electrical signals my face muscles make when I clench or raise my brow,
> plus the tilt from the headband's motion sensor. Not thoughts, but deliberate, repeatable,
> and reliable. That trade, honesty for reliability, is the whole design."

## 3 · How it actually works (2:00)  ← car tech, kept light
> "Under the hood it's four stages, and here's the part this room will like. The headband
> streams over Bluetooth to my laptop, and the whole thing runs in a browser. No cloud, no
> server. The browser reads the signals, decides 'that was a clench,' and sends one tiny command
> over WiFi to a little microcontroller on the car, which drives the motors.
>
> The fun problem was telling gestures apart: a jaw clench and an eyebrow raise are both just
> bursts of muscle noise. So how did I tell them apart? By *where* they land. A clench lights up the
> whole headset, eyebrows only light up the forehead. And there's no machine learning here, no
> training data, just a five-second calibration where it learns your personal baseline. That's
> it. Bandpass filters and a stopwatch, basically."

## 4 · How I built it (1:30)  ← the ONE 'still learning' moment
> "So how does someone build this? I grew up on Iron Man, the idea that you can build your way
> out of any hole. For years that stayed a fantasy, I used technology, I didn't make it.
>
> Then I met Tejas Kumar, at church here in Berlin, and he put words to it: we live in a
> builder's era. *(quick show of hands: who's made anything with AI this year? react, see note)*
> With AI, the gap between an idea you care about and a working version of it has collapsed. I
> vibe-coded this entire car while still learning to actually code, I describe what I want, the
> AI writes it, it breaks, we fix it. *(he's been enough of a push that my code literally lives
> in a folder with his name on it.)* I started two months ago."

> **Reacting to the hands (works either way):**
> - *Lots:* "Yeah, look around. That's new."
> - *Few:* "Barely any? Perfect, that's exactly who this is for."

## 5 · The build was a comedy of problems (1:30)  ← car build story
> "And it did not go to plan. It was a comedy of problems: four counterfeit motor chips that I
> had to diagnose one pin at a time, textbooks that were flat wrong about how my own hardware
> behaved, signals that looked like pure noise until I figured out the pattern. None of it
> worked the first time. But that's the thing nobody tells you, that *is* building. Every
> problem was just the next hole to climb out of. Very Tony Stark, minus the billions."

## 6 · LIVE DEMO (2:00) — *the payoff; hands off keyboard, let it breathe*
> "Okay. Enough talking, let me actually drive it."
1. **Calibrate**, "five seconds sitting still, four green dots."
2. **Arm**, "until now it ignored me completely, that's safety layer one."
3. **Forward**, "harder clench, more speed." *(light to hard)*
4. **Reverse**, "eyebrows up." 5. **Steer**, "tilt to turn."
6. **Stop**, "I disarm, and even if my laptop died, a half-second watchdog stops it on its own."

## 7 · Takeaway + close (1:00)
> "I'm not up here because this car is special. I'm here because two months ago I was where some
> of you might be, loving this stuff from the outside, assuming I needed permission to make it.
> I didn't. I needed an idea I genuinely cared about, an AI, and a bit of Tony Stark stubbornness
> when it broke.
>
> Because here's the honest catch: AI lowered the barrier to *starting*, it never lowered the bar
> for doing something *well*. The tools got free, taste didn't. And that's the exciting part,
> taste, caring about the thing, is something you already have. So go build the thing you care
> about this week, and come drive the car after. Thank you."

---

## What's different vs the main script (v1)
- **Car is the clear subject**: new beats 2 and 3 are all about what Headcar is and how it works, up front.
- **"Can't code" appears once** (beat 4, "while still learning to actually code"), instead of in the hook, the middle, and the close.
- **~1:45 longer** thanks to the added car content (meets your "need more time").
- Iron Man / builder's era / taste arc is **kept but condensed** into beat 4 + the close.
- If you adopt this, add **one slide** between current slides 2 and 5: a "Meet Headcar" slide (the 3 gestures) and/or a "How it works" pipeline slide.
