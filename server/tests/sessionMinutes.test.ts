import { computePair } from "../src/lib/sessionMinutes";
const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const at = (m: number) => new Date(T0 + m * 60000);
const ev = (userId: number, eventType: string, m: number) => ({ userId, eventType, timestamp: at(m) });
let fails = 0;
const eq = (name: string, got: number, want: number) => { if (Math.abs(got - want) > 1e-6) { fails++; console.log(`FAIL ${name}: got ${got}, want ${want}`); } else console.log(`ok   ${name}`); };

// 10+10+10 with <=5 min gaps -> one logical session of 30
let r = computePair([ev(1,"join",0),ev(2,"join",0),ev(1,"leave",10),ev(2,"leave",10),ev(1,"join",13),ev(2,"join",13),ev(1,"leave",23),ev(2,"leave",23),ev(1,"join",26),ev(2,"join",26),ev(1,"leave",36),ev(2,"leave",36)], 1, 2, at(60));
eq("10+10+10 joined", r.qualifyingMinutes, 30); eq("one session", r.sessions.length, 1); eq("2 interruptions", r.interruptions, 2);
// 10 + 10 hours apart -> not combined
r = computePair([ev(1,"join",0),ev(2,"join",0),ev(1,"leave",10),ev(2,"leave",10),ev(1,"join",300),ev(2,"join",300),ev(1,"leave",310),ev(2,"leave",310)], 1, 2, at(400));
eq("hours apart best", r.qualifyingMinutes, 10); eq("two sessions", r.sessions.length, 2);
// teacher 0-15, student 15-30 -> no overlap
r = computePair([ev(1,"join",0),ev(1,"leave",15),ev(2,"join",15),ev(2,"leave",30)], 1, 2, at(60));
eq("no overlap", r.qualifyingMinutes, 0);
// still connected at class end is clamped to endAt
r = computePair([ev(1,"join",0),ev(2,"join",5)], 1, 2, at(25));
eq("open clamp", r.qualifyingMinutes, 20);
if (fails) process.exit(1);
