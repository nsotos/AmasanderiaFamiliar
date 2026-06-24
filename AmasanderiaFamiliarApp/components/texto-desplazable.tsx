import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

interface TextoDesplazableProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextoDesplazable({
  text,
  style,
  containerStyle,
}: TextoDesplazableProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animacionRef = useRef<Animated.CompositeAnimation | null>(null);

  const debeDesplazar =
    textWidth > containerWidth + 2 && containerWidth > 0 && text.length > 0;

  useEffect(() => {
    setTextWidth(0);
  }, [text]);

  useEffect(() => {
    animacionRef.current?.stop();
    translateX.setValue(0);

    if (!debeDesplazar) return;

    const distancia = textWidth - containerWidth + 16;
    const duracion = Math.max(2500, distancia * 30);

    animacionRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(translateX, {
          toValue: -distancia,
          duration: duracion,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animacionRef.current.start();

    return () => {
      animacionRef.current?.stop();
    };
  }, [debeDesplazar, textWidth, containerWidth, translateX]);

  const onContenedorLayout = (event: LayoutChangeEvent) => {
    const ancho = event.nativeEvent.layout.width;
    if (ancho > 0) setContainerWidth(ancho);
  };

  const onTextoLayout = (event: LayoutChangeEvent) => {
    const ancho = event.nativeEvent.layout.width;
    if (ancho > 0) setTextWidth(ancho);
  };

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <View pointerEvents="none" style={styles.medidor}>
        <Text style={style} onLayout={onTextoLayout}>
          {text}
        </Text>
      </View>

      <View
        style={styles.recorte}
        onLayout={onContenedorLayout}
        collapsable={false}
      >
        {debeDesplazar ? (
          <Animated.Text
            style={[
              style,
              { width: textWidth, transform: [{ translateX }] },
            ]}
          >
            {text}
          </Animated.Text>
        ) : (
          <Text style={style} numberOfLines={1} ellipsizeMode="clip">
            {text}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    flexShrink: 1,
  },
  medidor: {
    position: "absolute",
    opacity: 0,
    top: 0,
    left: -10000,
    width: 10000,
    flexDirection: "row",
    zIndex: -1,
  },
  recorte: {
    overflow: "hidden",
    width: "100%",
  },
});
