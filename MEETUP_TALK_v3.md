# Headcar, AI Meetup talk, DRAFT v3 (merge) — rough

> Your blend: v2's **car-forward intro** (hook + meet the car), then a **personal pivot**
> into v1's Iron Man origin, then the rest. Does NOT replace v1 (`MEETUP_TALK.md`) or v2
> (`MEETUP_TALK_v2.md`). Commas, no em-dashes. Rough draft, runs a touch long (~11 min),
> easy to trim later.

**Flow:** what it is → *who I am / why* → how it works → how it broke → drive it → go build.

---

## Beat sheet (~11:00)

| # | Beat | Source | Time |
|---|------|--------|------|
| 1 | Hook, drive a car with your face | v2 | 0:45 |
| 2 | Meet the car | v2 | 2:00 |
| 3 | "So how did I do it? First, a little about me" → Iron Man | v1 | 1:30 |
| 4 | The spark, builder's era + vibe-coding (+ show of hands) | v1/v2 | 1:30 |
| 5 | How it actually works | v2 | 1:45 |
| 6 | The build, a comedy of problems | v2 | 1:30 |
| 7 | **LIVE DEMO** | both | 2:00 |
| 8 | Takeaway + close | v1/v2 | 1:00 |

---

## 1 · Hook (0:45)
*(car in hand, no remote)*
> "In a few minutes, I'm going to drive this car across the room, with my face. *(pause, hold
> it up)* No remote, no app. I call it Headcar, and I built it in about two months. *(beat)*
> But let me show you what it actually is, because it's stranger and simpler than
> 'brain-controlled car' makes it sound."

## 2 · Meet the car (2:00)
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

## 3 · So how did I do it? First, a little about me (1:30)  ← the pivot into v1's heart
> "So how did I do it? Before that, let me tell you a little about me.
>
> I grew up obsessed with Iron Man. Not the flying or the fighting, but the way Tony Stark could
> always build his way out of any hole. Stuck in a cave? Build a suit. Dying? Invent a new
> element. That idea, that you can engineer your way out of anything, stuck with me.
>
> But for years it stayed a fantasy. I used technology, I didn't make it. I assumed building the
> real stuff was for other people, not me."

## 4 · The spark, the builder's era (1:30)
> "Then I met Tejas Kumar, at church here in Berlin. We started as friends, but when he heard I
> study Mechatronics and saw a few of my projects, he changed my view on this very important matter: we live in a
> builder's era, he said. *(he's been enough of a push that my code literally lives in a folder with his name on it.)*"
> *(quick show of hands: who's made anything with AI this year? react, see note)*
> **Reacting to the hands (works either way):**
> - *Lots:* "Yeah, look around. That's new."
> - *Few:* "Barely any? Perfect, that's exactly who this is for."
> With AI, the gap between an idea you care about and a working version of it has collapsed.
>
> So I started. I vibe-coded this entire car while still learning to actually code: I describe
> what I want, the AI writes it, it breaks, we fix it. 


## 5 · How it actually works (1:45)
> "So that's how I got here. Now let me show you how the car itself works, because the clever bit
> isn't mine, it's where the signals land.
>
> Four stages: the headband streams over Bluetooth to my laptop, the whole thing runs in a
> browser, no cloud. The browser reads the signals, decides 'that was a clench,' and sends one
> tiny command over WiFi to a microcontroller on the car, which drives the motors.
>
> The fun problem was telling gestures apart: a jaw clench and an eyebrow raise are both just
> bursts of muscle noise. So how do you separate them? By where they land. A clench lights up the
> whole headset, eyebrows only the forehead. And there's no machine learning, no training data,
> just a five-second calibration that learns your baseline. Bandpass filters and a stopwatch."

## 6 · The build, a comedy of problems (1:30)
> "And it did not go to plan. It was a comedy of problems: four counterfeit motor chips I had to
> diagnose one pin at a time, textbooks that were flat wrong about how my own hardware behaved,
> signals that looked like pure noise until I found the pattern. None of it worked the first
> time. But that's the thing nobody tells you, that is building. Every problem was just the next
> hole to climb out of. Very Tony Stark, minus the billions."

## 7 · LIVE DEMO (2:00) — *the payoff; hands off keyboard, let it breathe*
> "Okay. Enough talking, let me actually drive it."
1. **Calibrate**, "five seconds sitting still, four green dots."
2. **Arm**, "until now it ignored me completely, that's safety layer one."
3. **Forward**, "harder clench, more speed." *(light to hard)*
4. **Reverse**, "eyebrows up." 5. **Steer**, "tilt to turn."
6. **Stop**, "I disarm, and even if my laptop died, a half-second watchdog stops it on its own."

## 8 · Takeaway + close (1:00) — *the payoff*
> "A room like this, most of you can already code, probably better than I can. So this was never a
> 'learn to code' story. What I actually want to leave you with is simpler: two months ago I had an
> idea I couldn't stop thinking about, and instead of waiting until I felt ready, I just started,
> and kept going every time it broke.
>
> Because here's the honest catch: AI lowered the barrier to starting, it never lowered the bar
> for doing something well. The tools got free, taste didn't. And that's the exciting part,
> because taste, actually caring about the thing, is something you already have. The AI can write
> the code. It can't want the thing for you.
>
> So go build the thing you keep putting off, the one you actually care about. Start before you're
> ready, and come drive the car after. Thank you."

---

## Notes
- **Trims if you need to hit 10:00:** tighten beat 5 (how it works) or beat 6 (build); both can lose ~20s without hurting.
- "two months" now lands twice (hook + close) on purpose; vibe-coding/learning-to-code lands once (beat 4).
- Slides: this wants the v2 additions, a "Meet Headcar" slide (2) and a light "how it works" slide (5), plus the existing Iron Man / builder's-era / LIVE / close slides.
