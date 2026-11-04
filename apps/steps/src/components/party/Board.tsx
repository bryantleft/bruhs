import { Platform, StyleSheet, View } from 'react-native';
import type { PartyMember } from '../../friends/model';
import { formatSteps } from '../../game/labels';
import { color, font, radius, space, typography } from '../../theme/theme';
import { Bruh } from '../Bruh';
import { Copy } from '../ui';

function Member({ member, mine }: Readonly<{ member: PartyMember; mine: boolean }>): React.JSX.Element {
  const rank = member.place === null ? '—' : `${member.tied && member.tied > 1 ? '=' : ''}${member.place}`;
  return (
    <View
      style={[styles.member, mine && styles.myRow]}
      accessible
      role="listitem"
      {...(Platform.OS === 'web' ? { dataSet: { partyMember: member.id }, tabIndex: -1 } : {})}
      accessibilityLabel={`${member.name}${mine ? ', you' : ''}. ${member.steps === null ? 'No steps shared this week' : `${member.tied && member.tied > 1 ? 'Tied for ' : ''}place ${member.place}. ${formatSteps(member.steps)}`}`}
    >
      <Copy variant="label" style={[styles.rank, member.place === 1 && { color: color.primary }]}>
        {rank}
      </Copy>
      <Bruh skin={member.skin} size={44} />
      <View style={styles.memberCopy}>
        <Copy style={styles.memberName}>
          {member.name}
          {mine ? (
            <Copy variant="inherit" style={{ color: color.secondary }}>
              {' · you'}
            </Copy>
          ) : null}
        </Copy>
        <Copy variant="small" style={{ color: member.steps === null ? color.secondary : color.success }}>
          {member.steps === null ? 'not synced' : formatSteps(member.steps)}
        </Copy>
      </View>
    </View>
  );
}

// This week's leaderboard. Web rows carry their member id so focus can move to the first new
// row after loading more.
export function Board({
  rows,
  userId,
  waiting,
}: Readonly<{ rows: readonly PartyMember[]; userId: string | null; waiting: boolean }>): React.JSX.Element {
  return (
    <View style={styles.board} role="list" accessibilityLabel="Weekly party leaderboard">
      {rows.map((member) => (
        <Member key={member.id} member={member} mine={member.id === userId} />
      ))}
      {!rows.length ? (
        <Copy style={styles.empty}>
          {waiting ? 'waiting for your party…' : 'refresh to load your party.'}
        </Copy>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: space.tight },
  empty: { paddingVertical: space.group },
  member: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.related,
    rowGap: space.tight,
    padding: space.related,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.lychee,
  },
  myRow: { borderColor: `${color.success}50`, backgroundColor: color.panel },
  rank: { minWidth: 20, maxWidth: '100%', color: color.secondary, fontVariant: ['tabular-nums'] },
  memberCopy: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
    gap: space.micro,
  },
  memberName: {
    fontFamily: font.label,
    fontSize: typography.small.fontSize,
    lineHeight: typography.small.lineHeight,
    color: color.text,
  },
});
