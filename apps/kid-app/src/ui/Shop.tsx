import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Cosmetic, CosmeticSlot, EquippedMap } from "@institute/progression";

const SLOT_ORDER: readonly CosmeticSlot[] = ["tutorHat", "heroOutfit", "pet"];

const SLOT_TITLES: Record<CosmeticSlot, string> = {
  tutorHat: "Tutor Hats",
  heroOutfit: "Hero Outfits",
  pet: "Pets",
};

export function Shop({
  gems,
  catalog,
  owned,
  equipped,
  onBuy,
  onEquip,
  onClose,
}: {
  gems: number;
  catalog: readonly Cosmetic[];
  owned: string[];
  equipped: EquippedMap;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.gemsBadge}>
            <Text style={styles.gemsText}>💎 {gems}</Text>
          </View>
          <Text style={styles.headerTitle}>Closet</Text>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {SLOT_ORDER.map((slot) => {
            const items = catalog.filter((c) => c.slot === slot);
            if (items.length === 0) return null;
            return (
              <View key={slot} style={styles.section}>
                <Text style={styles.sectionTitle}>{SLOT_TITLES[slot]}</Text>
                <View style={styles.grid}>
                  {items.map((item) => (
                    <ShopCard
                      key={item.id}
                      item={item}
                      gems={gems}
                      isOwned={owned.includes(item.id)}
                      isEquipped={equipped[item.slot] === item.id}
                      onBuy={onBuy}
                      onEquip={onEquip}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ShopCard({
  item,
  gems,
  isOwned,
  isEquipped,
  onBuy,
  onEquip,
}: {
  item: Cosmetic;
  gems: number;
  isOwned: boolean;
  isEquipped: boolean;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
}) {
  const canAfford = gems >= item.cost;

  return (
    <View style={styles.card}>
      <View style={[styles.swatch, { backgroundColor: item.swatch }]} />
      <Text style={styles.itemName} numberOfLines={1}>
        {item.name}
      </Text>
      {renderAction()}
    </View>
  );

  function renderAction() {
    if (isEquipped) {
      return (
        <View style={[styles.action, styles.actionEquipped]}>
          <Text style={styles.actionEquippedText}>Equipped ✓</Text>
        </View>
      );
    }
    if (isOwned) {
      return (
        <Pressable
          style={[styles.action, styles.actionEquip]}
          onPress={() => onEquip(item.id)}
          hitSlop={6}
        >
          <Text style={styles.actionText}>Equip</Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        style={[styles.action, styles.actionBuy, !canAfford && styles.actionDisabled]}
        onPress={canAfford ? () => onBuy(item.id) : undefined}
        disabled={!canAfford}
        hitSlop={6}
      >
        <Text style={styles.actionText}>Buy 💎{item.cost}</Text>
      </Pressable>
    );
  }
}

const CARD_GAP = 12;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff7ef",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#5b2ea0",
  },
  gemsBadge: {
    backgroundColor: "#ffffff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  gemsText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2b2b2b",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
  },
  body: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#5b2ea0",
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  card: {
    width: 150,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  swatch: {
    width: 64,
    height: 64,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.08)",
  },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2b2b2b",
    marginBottom: 12,
    textAlign: "center",
  },
  action: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  actionBuy: {
    backgroundColor: "#2bb3a3",
  },
  actionEquip: {
    backgroundColor: "#ff6b5e",
  },
  actionEquipped: {
    backgroundColor: "#e9fbe9",
    borderWidth: 2,
    borderColor: "#2e8b2e",
  },
  actionDisabled: {
    backgroundColor: "#cccccc",
    opacity: 0.6,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
  },
  actionEquippedText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2e8b2e",
  },
});
