import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import InspectionDraft from '../database/models/InspectionDraft';
import Property from '../database/models/Property';
import DraftRoom from '../database/models/DraftRoom';
import colors from '../config/colors';
import syncQueueManager from '../services/sync/SyncQueueManager';

interface ReconciliationProps {
  navigation: any;
}

const Reconciliation: React.FC<ReconciliationProps> = ({ navigation }) => {
  const [conflictDrafts, setConflictDrafts] = useState<InspectionDraft[]>([]);
  const [propertiesMap, setPropertiesMap] = useState<{ [id: string]: Property }>({});
  const [selectedDraft, setSelectedDraft] = useState<InspectionDraft | null>(null);
  const [draftRooms, setDraftRooms] = useState<DraftRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConflictData();
  }, []);

  const loadConflictData = async () => {
    setLoading(true);
    try {
      // Find all drafts with sync_status === 'conflict_detected'
      const draftsCollection = database.get<InspectionDraft>('inspection_drafts');
      const conflicts = await draftsCollection
        .query(Q.where('sync_status', 'conflict_detected'))
        .fetch();

      setConflictDrafts(conflicts);

      if (conflicts.length > 0) {
        const active = conflicts[0];
        setSelectedDraft(active);

        // Fetch property
        try {
          const prop = await database.get<Property>('properties').find(active.propertyId);
          setPropertiesMap({ [active.propertyId]: prop });
        } catch {
          // Property not found
        }

        // Fetch draft rooms
        const dRooms = await database
          .get<DraftRoom>('draft_rooms')
          .query(Q.where('draft_id', active.id))
          .fetch();
        setDraftRooms(dRooms);
      }
    } catch (error) {
      console.error('Error loading reconciliation conflicts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Button A: "Keep My Changes" -> update property_version to match latest server version, reset sync_status to pending_sync
  const handleKeepMyChanges = async () => {
    if (!selectedDraft) return;

    const prop = propertiesMap[selectedDraft.propertyId];
    const latestVersion = prop ? prop.version : selectedDraft.propertyVersion + 1;

    try {
      await database.write(async () => {
        await selectedDraft.update(r => {
          r.propertyVersion = latestVersion;
          r.syncStatus = 'pending_sync';
          r.errorMessage = undefined;
        });
      });

      Alert.alert(
        'Conflict Resolved',
        'Your draft version was updated to match server version. Queued for resync.',
        [{ text: 'OK', onPress: () => loadConflictData() }]
      );

      // Re-trigger sync queue
      syncQueueManager.processQueue();
    } catch (error) {
      console.error('Error keeping changes:', error);
      Alert.alert('Error', 'Could not resolve conflict.');
    }
  };

  // Button B: "Review & Merge" -> Opens Inspection screen to edit notes before re-queuing
  const handleReviewAndMerge = () => {
    if (!selectedDraft) return;
    navigation.navigate('Inspection', { draftId: selectedDraft.id });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (conflictDrafts.length === 0 || !selectedDraft) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reconciliation</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>No Version Conflicts</Text>
          <Text style={styles.emptySub}>
            All local inspection drafts are in sync with the server version.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentProperty = propertiesMap[selectedDraft.propertyId];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reconciliation Center</Text>
        <View style={styles.conflictBadge}>
          <Text style={styles.conflictBadgeText}>
            {conflictDrafts.length} Conflict{conflictDrafts.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>
          Property: {currentProperty ? currentProperty.name : selectedDraft.propertyId}
        </Text>
        <Text style={styles.sectionSubtitle}>
          The property version was updated on the server while you were offline. Compare your local submission with the new server state below.
        </Text>

        {/* Two-Column Comparison View */}
        <View style={styles.comparisonContainer}>
          {/* Left Column: Local Draft */}
          <View style={[styles.columnCard, styles.leftColumn]}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>Local Draft</Text>
              <Text style={styles.versionTag}>v{selectedDraft.propertyVersion}</Text>
            </View>

            <Text style={styles.detailLabel}>Type: {selectedDraft.type}</Text>
            <Text style={styles.detailLabel}>
              Completed: {new Date(selectedDraft.completedAt * 1000).toLocaleTimeString()}
            </Text>

            <Text style={styles.subHeader}>Rooms Recorded:</Text>
            {draftRooms.map(r => (
              <View key={r.id} style={styles.roomDiffItem}>
                <Text style={styles.roomDiffText} numberOfLines={1}>
                  Room {r.roomId}: {r.condition}
                </Text>
              </View>
            ))}
          </View>

          {/* Right Column: Conflicting Server Version */}
          <View style={[styles.columnCard, styles.rightColumn]}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>Server Version</Text>
              <Text style={[styles.versionTag, styles.serverVersionTag]}>
                v{currentProperty ? currentProperty.version : '?'}
              </Text>
            </View>

            <Text style={styles.detailLabel}>
              Status: {currentProperty ? currentProperty.status : 'Active'}
            </Text>
            <Text style={styles.detailLabel}>
              Region: {currentProperty ? currentProperty.region : 'N/A'}
            </Text>
            <Text style={styles.detailLabel}>
              Units: {currentProperty ? currentProperty.unitCount : 'N/A'}
            </Text>

            <Text style={styles.subHeader}>Server State:</Text>
            <Text style={styles.serverNotice}>
              Server record updated to v{currentProperty?.version}. Update version or merge notes to continue.
            </Text>
          </View>
        </View>

        {/* Resolution Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.keepBtn}
            onPress={handleKeepMyChanges}
            activeOpacity={0.8}>
            <Text style={styles.keepBtnText}>Button A: Keep My Changes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reviewBtn}
            onPress={handleReviewAndMerge}
            activeOpacity={0.8}>
            <Text style={styles.reviewBtnText}>Button B: Review & Merge</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Reconciliation;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  conflictBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conflictBadgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  comparisonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  columnCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 4,
  },
  leftColumn: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  rightColumn: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  versionTag: {
    backgroundColor: colors.accent,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  serverVersionTag: {
    backgroundColor: colors.primary,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  roomDiffItem: {
    backgroundColor: colors.background,
    padding: 6,
    borderRadius: 4,
    marginBottom: 4,
  },
  roomDiffText: {
    fontSize: 11,
    color: colors.text,
  },
  serverNotice: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  actionsContainer: {
    marginTop: 8,
  },
  keepBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  keepBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  reviewBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reviewBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
