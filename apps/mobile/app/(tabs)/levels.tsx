import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageTitle } from '@/components/page-title';
import { Card, Row, TopBar } from '@/components/wireframe';
import { Colors, OtterPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth';

type AccessDot = 'all' | 'sea' | 'river' | 'pool';
type Access = { dot: AccessDot; text: string };
type LevelInfo = {
  id: string; // matches profiles.level
  num: string;
  emoji: string;
  name: string;
  subtitle: string;
  description: string[];
  craft?: { sea: string; river: string };
  accessLabel: string;
  access: Access[];
  advanceLabel: string;
  advanceText: string;
  corrIcon: string;
  corrText: string;
  zoneHeader?: string;
  tag?: string;
  pending?: boolean; // access rules not yet confirmed — fade + "coming soon"
};

const DOT_COLOR: Record<AccessDot, string> = {
  all: OtterPalette.slateNavy,
  sea: OtterPalette.seaTeal[1],
  river: OtterPalette.riverGreen[1],
  pool: OtterPalette.pinkstonOrange[0],
};

// Ported from the prototype's Levels page (docs/otter-pool-levels.html).
const LEVELS: LevelInfo[] = [
  {
    id: 'frog',
    num: 'Level 1',
    emoji: '🐸',
    name: 'Frog',
    subtitle: 'New full member · finding your feet on the water',
    description: [
      'Frogs have just taken the big leap of starting kayaking or canoeing for the first time, either on their own or with a friend, and may not have done a capsize drill before with a spray-deck on.',
      "You can ask someone more experienced to show you a capsize at any Tuesday evening event — it's often left to the end of the evening so you can get straight out to dry off. At which point you turn from a frog… into a duck!",
    ],
    craft: {
      sea: 'Flat calm, sheltered water only. Still finding stability in the boat.',
      river: 'Flat water and very gentle Grade 1 only.',
    },
    accessLabel: 'What you can join — until your capsize drill',
    access: [
      { dot: 'all', text: 'Loch Lomond — Tuesday evening sessions' },
      { dot: 'all', text: 'Pool sessions' },
    ],
    advanceLabel: 'Advancing to Duck',
    advanceText:
      'There are no fixed criteria — advancement is based on the judgement of experienced members who have paddled with you. The key step is a capsize drill with a spray-deck on.',
    corrIcon: '👥',
    corrText:
      'One witness at Dolphin level or above corroborates your readiness. A Paddling Admin sets your approval ceiling accordingly.',
  },
  {
    id: 'duck',
    num: 'Level 2',
    emoji: '🦆',
    name: 'Duck',
    subtitle: 'Developing paddler · comfortable on sheltered water',
    description: [
      'Ducks have carried out a capsize drill, with a spray-deck on, in a kayak — either in a swimming pool or outside. You can ask someone more experienced to show you this at any Tuesday evening meet.',
      'Note: having done a capsize on a sit-on-top does not count, unfortunately.',
    ],
    craft: {
      sea: 'Sheltered coastal water and light chop. Comfortable in Force 2–3. Beginning to read wind and conditions.',
      river: 'Grade 1–2. Straightforward moving water with simple currents.',
    },
    accessLabel: 'What you can join',
    access: [
      { dot: 'all', text: 'Everything at Frog level (pool + loch sessions)' },
      { dot: 'all', text: 'All Away trips' },
      { dot: 'pool', text: 'Pinkston introductory night' },
      { dot: 'sea', text: 'Second Saturday paddles — with leader approval' },
      { dot: 'sea', text: 'Sea Grade A trips — with leader approval' },
    ],
    advanceLabel: 'Advancing to Otter',
    advanceText:
      "Again, no fixed criteria. The question leaders ask is whether you paddle with good awareness and judgement, and whether you're ready for more committing water.",
    corrIcon: '👥',
    corrText:
      'Two witnesses at Paddlesport Leader level or above must corroborate your readiness. A Paddling Admin sets your new approval ceiling.',
  },
  {
    id: 'otter',
    num: 'Level 3',
    emoji: '🦦',
    name: 'Otter',
    pending: true,
    subtitle: 'Experienced paddler · ready for open and moving water',
    description: [
      'Otters can reliably perform a rescue successfully while on the water — using a heel hook and not swimming to the shore or bank — and have also been rescued successfully.',
      'Note: performing a rescue in a kayak does not make you an Otter in other craft — it would not make you an Otter in a canoe or on a SUP.',
    ],
    craft: {
      sea: 'Comfortable in waves and Force 4 winds. Can maintain boat control and perform rescues in confused seas.',
      river: 'Confident on Grade 3. Reads water well and can execute rescues on moving water.',
    },
    accessLabel: 'What you can join',
    access: [
      { dot: 'all', text: 'Everything at Duck level' },
      { dot: 'sea', text: 'Sea Grade B and C trips, with leader approval' },
      { dot: 'pool', text: 'Pinkston 1, 2 and 3 pump sessions' },
      { dot: 'river', text: 'River trips up to Grade 3/4, with leader approval' },
      { dot: 'all', text: 'Multi-day expeditions and overnight trips' },
    ],
    advanceLabel: 'Advancing to Dolphin',
    advanceText:
      'Dolphin is a significant step — it recognises a well-rounded paddler with broad experience, approaching the level where leadership becomes possible.',
    corrIcon: '👥',
    corrText:
      'Two witnesses at Sea Kayak Leader or Whitewater Kayak Leader level or above. A Paddling Admin sets your new approval ceiling.',
  },
  {
    id: 'dolphin',
    num: 'Level 4',
    emoji: '🐬',
    name: 'Dolphin',
    pending: true,
    subtitle: 'Advanced paddler · broad experience, emerging leader',
    description: [
      'Dolphins are leaders. Amongst other things they can perform rescues on others, reliably self-rescue, and are authorised by DCKC to run trips.',
      "Dolphin is the highest level within the club's internal progression — an accomplished paddler trusted to take responsibility for others on the water.",
    ],
    craft: {
      sea: 'Confident in Force 4+ and exposed conditions. Reliable roll. Can lead and rescue others in demanding sea states.',
      river:
        'Confident on Grade 4. Reliable roll. Reads complex water and supports others through technical sections.',
    },
    accessLabel: 'What you can join',
    access: [
      { dot: 'all', text: 'All club trips — full access, subject to leader approval' },
      { dot: 'sea', text: 'Grade C sea expeditions' },
      { dot: 'river', text: 'Grade 4 and above river trips' },
      { dot: 'all', text: 'Can act as assistant leader on appropriate trips' },
      { dot: 'all', text: 'Can corroborate Frog → Duck advancement as a single witness' },
    ],
    advanceLabel: 'The next step',
    advanceText:
      "Advancement beyond Dolphin moves into British Canoeing's formal qualification pathway — externally assessed and recognised nationally.",
    corrIcon: '🏅',
    corrText:
      'Paddlesport Leader, Sea Kayak Leader, or Whitewater Kayak Leader — assessed externally through British Canoeing. Speak to a Paddling Admin about supported pathways.',
  },
  {
    id: 'selkie',
    num: 'Level 5',
    emoji: '🦭',
    name: 'Selkie',
    subtitle: 'Qualified leader · nationally recognised',
    tag: 'British Canoeing',
    zoneHeader: 'Zone 2 — British Canoeing qualifications',
    description: [
      "Selkie encompasses all British Canoeing leadership qualifications held by DCKC members. Within this level there's a spectrum — from Paddlesport Leader through to Advanced Sea Kayak Leader — and a Selkie's approval ceiling reflects their specific qualifications.",
      'Selkie members are the leaders of the club. They create trips, approve member requests, mentor others, and carry responsibility for safety on the water.',
    ],
    accessLabel: 'Qualifications within Selkie',
    access: [
      { dot: 'all', text: 'Paddlesport Leader — general leadership on sheltered water' },
      { dot: 'sea', text: 'Sea Kayak Leader (SKL) — leads sea trips to Grade B/C' },
      { dot: 'river', text: 'Whitewater Kayak Leader (WWKL) — leads river trips to Grade 4+' },
      { dot: 'sea', text: 'Advanced SKL — leads advanced sea expeditions' },
      { dot: 'river', text: 'Advanced WWKL — leads advanced whitewater' },
    ],
    advanceLabel: 'Responsibilities',
    advanceText:
      'Selkie members create and lead club events, approve or decline join requests, and act as witnesses for progression at lower levels.',
    corrIcon: '📋',
    corrText:
      'BC qualifications are verified by a Paddling Admin and recorded against your profile. Speak to an admin to update your record after gaining a new qualification.',
  },
];

export default function LevelsScreen() {
  const palette = Colors[useColorScheme() ?? 'light'];
  const { profile } = useAuth();
  const myLevel = profile?.level ?? null;

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const [activeNav, setActiveNav] = useState<string>(myLevel ?? 'frog');

  const jumpTo = (id: string) => {
    setActiveNav(id);
    const y = offsets.current[id];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top']}>
      <PageTitle title="Levels" />
      <TopBar title="Levels" subtitle="The DCKC paddling progression" />

      {/* Jump nav */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.navBar, { borderBottomColor: palette.border }]}
        contentContainerStyle={styles.navContent}
      >
        {LEVELS.map((lv) => {
          const on = activeNav === lv.id;
          return (
            <Pressable
              key={lv.id}
              onPress={() => jumpTo(lv.id)}
              style={[
                styles.navPill,
                {
                  backgroundColor: on ? OtterPalette.forest : palette.surface,
                  borderColor: on ? OtterPalette.forest : palette.border,
                },
              ]}
            >
              <Text style={[styles.navText, { color: on ? '#fff' : palette.text }]}>
                {lv.emoji} {lv.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: palette.muted }]}>
          Levels aren't badges or rewards — they're a mutual system of trust. They reflect your
          experience and help leaders make good decisions about who's ready for which trips, so
          everyone stays safe on the water.
        </Text>

        <Pressable onPress={() => router.push('/profile')} testID="levels-experience-cta">
          <Card style={{ borderColor: OtterPalette.forest, borderWidth: 1.5 }}>
            <Text style={[styles.ctaTitle, { color: OtterPalette.forest }]}>
              Paddled a while already?
            </Text>
            <Text style={[styles.ctaBody, { color: palette.text }]}>
              If you've been paddling a while and would like to tell us about it to help us
              establish your level, you can do that on your profile.
            </Text>
            <Text style={[styles.ctaLink, { color: OtterPalette.slateNavy }]}>
              Tell us your experience ›
            </Text>
          </Card>
        </Pressable>

        {LEVELS.map((lv) => {
          const isMine = myLevel === lv.id;
          return (
            <View
              key={lv.id}
              onLayout={(e) => {
                offsets.current[lv.id] = e.nativeEvent.layout.y;
              }}
            >
              {lv.zoneHeader ? (
                <Text style={[styles.zone, { color: palette.muted }]}>{lv.zoneHeader}</Text>
              ) : null}
              <Card
                style={[
                  isMine ? { borderColor: OtterPalette.forest, borderWidth: 2 } : null,
                  lv.pending ? { opacity: 0.55 } : null,
                ]}
              >
                <Row style={{ gap: 12, alignItems: 'center' }}>
                  <View style={styles.numWrap}>
                    <Text style={[styles.num, { color: palette.muted }]}>{lv.num}</Text>
                    <Text style={styles.animal}>{lv.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Row style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.name, { color: palette.text }]}>{lv.name}</Text>
                      {isMine ? (
                        <Text style={[styles.badge, { backgroundColor: OtterPalette.forest }]}>
                          Your level
                        </Text>
                      ) : null}
                      {lv.tag ? (
                        <Text style={[styles.badge, { backgroundColor: OtterPalette.seaTeal[2] }]}>
                          {lv.tag}
                        </Text>
                      ) : null}
                    </Row>
                    <Text style={[styles.subtitle, { color: palette.muted }]}>{lv.subtitle}</Text>
                  </View>
                </Row>

                {lv.description.map((p) => (
                  <Text key={p.slice(0, 24)} style={[styles.body, { color: palette.text }]}>
                    {p}
                  </Text>
                ))}

                {lv.pending ? (
                  <View style={[styles.advance, { backgroundColor: palette.surface }]}>
                    <Text style={[styles.corrText, { color: palette.muted }]}>
                      We're still finalising exactly what {lv.name} unlocks and how you advance to
                      it — full details coming soon.
                    </Text>
                  </View>
                ) : (
                  <>
                    {lv.craft ? (
                      <View style={[styles.craft, { borderColor: palette.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.craftIcon, { color: OtterPalette.seaTeal[1] }]}>
                            🌊 Sea
                          </Text>
                          <Text style={[styles.craftText, { color: palette.muted }]}>
                            {lv.craft.sea}
                          </Text>
                        </View>
                        <View style={[styles.craftDivider, { backgroundColor: palette.border }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.craftIcon, { color: OtterPalette.riverGreen[1] }]}>
                            🟢 River
                          </Text>
                          <Text style={[styles.craftText, { color: palette.muted }]}>
                            {lv.craft.river}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                      {lv.accessLabel}
                    </Text>
                    {lv.access.map((a) => (
                      <Row key={a.text.slice(0, 24)} style={{ gap: 8, marginTop: 5 }}>
                        <View style={[styles.accessDot, { backgroundColor: DOT_COLOR[a.dot] }]} />
                        <Text style={[styles.accessText, { color: palette.text }]}>{a.text}</Text>
                      </Row>
                    ))}

                    <View style={[styles.advance, { backgroundColor: palette.surface }]}>
                      <Text style={[styles.advanceLabel, { color: OtterPalette.forest }]}>
                        {lv.advanceLabel}
                      </Text>
                      <Text style={[styles.body, { color: palette.text, marginTop: 4 }]}>
                        {lv.advanceText}
                      </Text>
                      <Row style={{ gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 16 }}>{lv.corrIcon}</Text>
                        <Text style={[styles.corrText, { color: palette.muted }]}>
                          {lv.corrText}
                        </Text>
                      </Row>
                    </View>
                  </>
                )}
              </Card>
            </View>
          );
        })}

        <Text style={[styles.footer, { color: palette.muted }]}>
          Questions about your level or progression? Speak to a Paddling Admin or any Selkie member.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  ctaTitle: { fontSize: 15, fontWeight: '700' },
  ctaBody: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  ctaLink: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  // react-native-web gives ScrollView `flex-basis: 0%`, so in this column
  // `flexGrow: 0` alone collapsed the pill row to a sliver of its bottom
  // border. Size it from its content and keep it from shrinking.
  navBar: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', borderBottomWidth: 1 },
  navContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  navPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  navText: { fontSize: 13, fontWeight: '600' },
  zone: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 2,
    paddingHorizontal: 20,
  },
  numWrap: { alignItems: 'center', width: 52 },
  num: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  animal: { fontSize: 34, marginTop: 2 },
  name: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  badge: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  body: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  craft: { flexDirection: 'row', gap: 12, marginTop: 12, borderTopWidth: 1, paddingTop: 12 },
  craftIcon: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  craftText: { fontSize: 12, lineHeight: 17 },
  craftDivider: { width: 1 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
  },
  accessDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  accessText: { fontSize: 13, lineHeight: 18, flex: 1 },
  advance: { marginTop: 14, borderRadius: 10, padding: 12 },
  advanceLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  corrText: { fontSize: 12, lineHeight: 17, flex: 1 },
  footer: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 24,
    marginTop: 18,
  },
});
