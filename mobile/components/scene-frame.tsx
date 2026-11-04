import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, type } from '@/constants/tokens';

interface SceneFrameProps {
  compact?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
  timecode?: string;
  variant?: 'auto' | 'harbor' | 'doorway' | 'interior';
}

function inferSceneVariant(label: string): 'harbor' | 'doorway' | 'interior' {
  if (/码头|港|河|江|海|桥|岸/.test(label)) return 'harbor';
  if (/门|楼|别墅|街|巷|院/.test(label)) return 'doorway';
  if (/室|厅|房|店|办公室|餐厅/.test(label)) return 'interior';
  return 'interior';
}

export function SceneFrame({
  compact = false,
  label = '雨夜码头',
  style,
  timecode = '00:42:18',
  variant = 'auto',
}: SceneFrameProps) {
  const sceneVariant = variant === 'auto' ? inferSceneVariant(label) : variant;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}分镜画面`}
      style={[styles.frame, compact && styles.frameCompact, style]}
    >
      <View style={styles.sky} />
      <View style={styles.haze} />
      {sceneVariant === 'harbor' ? (
        <>
          <View style={[styles.building, styles.buildingOne]} />
          <View style={[styles.building, styles.buildingTwo]} />
          <View style={[styles.building, styles.buildingThree]} />
          <View style={styles.water} />
          <View style={styles.pier} />
          <View style={styles.lampGlow} />
          <View style={styles.lampPost} />
          <View style={[styles.figure, styles.figureA]}>
            <View style={styles.head} />
            <View style={styles.body} />
          </View>
          <View style={[styles.figure, styles.figureB]}>
            <View style={styles.head} />
            <View style={[styles.body, styles.bodyCoat]} />
          </View>
        </>
      ) : sceneVariant === 'doorway' ? (
        <>
          <View style={[styles.building, styles.buildingOne]} />
          <View style={[styles.building, styles.buildingTwo]} />
          <View style={[styles.building, styles.buildingThree]} />
          <View style={styles.street} />
          <View style={styles.doorRecess} />
          <View style={styles.doorLight} />
          <View style={styles.doorStep} />
          <View style={[styles.figure, styles.figureA]}>
            <View style={styles.head} />
            <View style={[styles.body, styles.bodyCoat]} />
          </View>
          <View style={[styles.figure, styles.figureDoor]}>
            <View style={styles.head} />
            <View style={styles.body} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.interiorWall} />
          <View style={styles.interiorWindow} />
          <View style={styles.interiorTable} />
          <View style={styles.interiorLamp} />
          <View style={[styles.figure, styles.figureB]}>
            <View style={styles.head} />
            <View style={[styles.body, styles.bodyCoat]} />
          </View>
        </>
      )}
      <View style={styles.rain}>
        {[8, 20, 33, 47, 62, 76, 88].map((left) => (
          <View key={left} style={[styles.rainLine, { left: `${left}%` }]} />
        ))}
      </View>
      {!compact && (
        <>
          <View style={styles.vignette} />
          <View style={styles.metaRow}>
            <View style={styles.recRow}>
              <View style={styles.recDot} />
              <Text style={styles.metaText}>REC · EP03 / 17</Text>
            </View>
            <Text style={styles.timecode}>{timecode}</Text>
          </View>
          <View style={styles.frameLabel}>
            <Text style={styles.frameLabelText}>{label}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(230, 235, 230, 0.14)',
    backgroundColor: '#0A1112',
    aspectRatio: 9 / 16,
  },
  frameCompact: {
    aspectRatio: 16 / 10,
    borderRadius: 6,
  },
  sky: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#142122',
  },
  haze: {
    position: 'absolute',
    left: '-20%',
    right: '-20%',
    top: '8%',
    height: '38%',
    borderRadius: 999,
    backgroundColor: 'rgba(82, 117, 112, 0.12)',
  },
  building: {
    position: 'absolute',
    bottom: '37%',
    backgroundColor: '#0B1112',
  },
  buildingOne: {
    left: '2%',
    width: '30%',
    height: '27%',
  },
  buildingTwo: {
    left: '29%',
    width: '25%',
    height: '20%',
  },
  buildingThree: {
    right: '2%',
    width: '35%',
    height: '31%',
  },
  water: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '39%',
    backgroundColor: '#0B1618',
  },
  pier: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    bottom: '21%',
    height: 5,
    backgroundColor: 'rgba(139, 153, 143, 0.22)',
  },
  lampGlow: {
    position: 'absolute',
    top: '25%',
    right: '17%',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(218, 182, 116, 0.32)',
  },
  lampPost: {
    position: 'absolute',
    top: '25%',
    right: '19.2%',
    width: 2,
    height: '44%',
    backgroundColor: 'rgba(207, 179, 123, 0.52)',
  },
  figure: {
    position: 'absolute',
    bottom: '25%',
    width: 28,
    alignItems: 'center',
  },
  figureA: {
    left: '32%',
    transform: [{ scaleX: -1 }],
  },
  figureB: {
    right: '31%',
  },
  figureDoor: {
    left: '55%',
  },
  street: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '24%',
    backgroundColor: '#080D0E',
  },
  doorRecess: {
    position: 'absolute',
    left: '45%',
    bottom: '21%',
    width: '24%',
    height: '43%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#060A0B',
  },
  doorLight: {
    position: 'absolute',
    left: '49%',
    bottom: '21%',
    width: '7%',
    height: '28%',
    backgroundColor: 'rgba(216, 168, 94, 0.36)',
  },
  doorStep: {
    position: 'absolute',
    left: '41%',
    right: '36%',
    bottom: '19%',
    height: 4,
    backgroundColor: 'rgba(203, 207, 194, 0.24)',
  },
  interiorWall: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#151F20',
  },
  interiorWindow: {
    position: 'absolute',
    top: '14%',
    right: '13%',
    width: '28%',
    height: '34%',
    borderWidth: 5,
    borderColor: '#0A1011',
    backgroundColor: 'rgba(67, 91, 91, 0.36)',
  },
  interiorTable: {
    position: 'absolute',
    left: '14%',
    right: '40%',
    bottom: '23%',
    height: 6,
    backgroundColor: 'rgba(155, 127, 86, 0.3)',
  },
  interiorLamp: {
    position: 'absolute',
    top: '16%',
    left: '18%',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(218, 182, 116, 0.24)',
  },
  head: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#060A0B',
  },
  body: {
    width: 20,
    height: 55,
    marginTop: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#070B0C',
  },
  bodyCoat: {
    width: 25,
    height: 62,
  },
  rain: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.34,
  },
  rainLine: {
    position: 'absolute',
    top: '-12%',
    width: 1,
    height: '70%',
    backgroundColor: 'rgba(209, 225, 223, 0.22)',
    transform: [{ rotate: '12deg' }],
  },
  vignette: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(2, 5, 6, 0.18)',
  },
  metaRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  metaText: {
    color: 'rgba(235, 239, 234, 0.78)',
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  timecode: {
    color: 'rgba(235, 239, 234, 0.7)',
    fontFamily: fonts.mono,
    fontSize: type.micro,
  },
  frameLabel: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(8, 12, 13, 0.72)',
  },
  frameLabelText: {
    color: '#F4F2ED',
    fontSize: type.caption,
    fontWeight: '600',
  },
});

