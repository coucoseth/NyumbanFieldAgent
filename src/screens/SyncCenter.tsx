import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { database } from '../database';
import InspectionDraft from '../database/models/InspectionDraft';
import LocalPhoto from '../database/models/LocalPhoto';
import Property from '../database/models/Property';
import colors from '../config/colors';
import syncQueueManager from '../services/sync/SyncQueueManager';

interface SyncCenterProps {
  navigation: any;
}

const SERVER_PHOTO_QUOTA = 200;

const SyncCenter: React.FC<SyncCenterProps> = () => {
  const [drafts, setDrafts] = useState<InspectionDraft[]>([]);
  const [propertyNames, setPropertyNames] = useState<{ [id: string]: string }>({});
  const [pendingPhotosCount, setPendingPhotosCount] = useState(0);
  const [totalPhotosCount, setTotalPhotosCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSyncData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all inspection drafts
      const draftsCollection = database.get<InspectionDraft>('inspection_drafts');
      const allDrafts = await draftsCollection.query().fetch();
      setDrafts(allDrafts);

      // Map property names
      const propCollection = database.get<Property>('properties');
      const names: { [id: string]: string } = {};
      for (const d of allDrafts) {
        try {
          const p = await propCollection.find(d.propertyId);
          names[d.propertyId] = p.name;
        } catch {
          names[d.propertyId] = `Property ${d.propertyId}`;
        }
      }
      setPropertyNames(names);

      // Fetch photos stats
      const photosCollection = database.get<LocalPhoto>('local_photos');
      const allPhotos = await photosCollection.query().fetch();
      setTotalPhotosCount(allPhotos.length);

      const pendingPhotos = allPhotos.filter(p => p.syncStatus === 'pending');
      setPendingPhotosCount(pendingPhotos.length);
    } catch (error) {
      console.error('Error loading sync dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSyncData();
  }, [loadSyncData]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncQueueManager.processQueue();
    } finally {
      setIsSyncing(false);
      loadSyncData();
    }
  };

  // Stats calculation
  const activeSyncCount = drafts.filter(
    d => d.syncStatus === 'pending_sync' || d.syncStatus === 'syncing'
  ).length;

  const failedSyncCount = drafts.filter(
    d => d.syncStatus === 'failed' || d.syncStatus === 'conflict_detected'
  ).length;

  const syncedCount = drafts.filter(d => d.syncStatus === 'synced').length;

  // Quota gauge percentage
  const quotaPercent = Math.min(
    100,
    Math.round((totalPhotosCount / SERVER_PHOTO_QUOTA) * 100)
  );

  const renderDraftItem = ({ item }: { item: InspectionDraft }) => {
    const propName = propertyNames[item.propertyId] || item.propertyId;
    let badgeColor = colors.pending;
    let badgeText = item.syncStatus;

    if (item.syncStatus === 'synced') badgeColor = colors.active;
    if (item.syncStatus === 'failed' || item.syncStatus === 'conflict_detected')
      badgeColor = colors.error;

    return (
      <View style={styles.listItem}>
        <View style={styles.listMain}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {propName}
          </Text>
          <Text style={styles.itemSubtitle}>
            Draft ID: {item.id} • v{item.propertyVersion}
          </Text>
          {item.errorMessage ? (
            <Text style={styles.errorText} numberOfLines={1}>
              ⚠️ {item.errorMessage}
            </Text>
          ) : null}
        </View>

        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sync Center Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress Dashboard Card */}
        <View style={styles.dashboardCard}>
          <Text style={styles.cardSectionTitle}>Outbox Sync Metrics</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{activeSyncCount}</Text>
              <Text style={styles.metricLabel}>Pending Sync</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{pendingPhotosCount}</Text>
              <Text style={styles.metricLabel}>Queued Photos</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: colors.error }]}>
                {failedSyncCount}
              </Text>
              <Text style={styles.metricLabel}>Failed / Conflict</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: colors.active }]}>
                {syncedCount}
              </Text>
              <Text style={styles.metricLabel}>Synced</Text>
            </View>
          </View>
        </View>

        {/* Storage Quota Gauge Card */}
        <View style={styles.dashboardCard}>
          <View style={styles.quotaHeader}>
            <Text style={styles.cardSectionTitle}>Server Storage Quota Gauge</Text>
            <Text style={styles.quotaFraction}>
              {totalPhotosCount} / {SERVER_PHOTO_QUOTA} Photos
            </Text>
          </View>

          {/* Gauge Bar */}
          <View style={styles.gaugeBackground}>
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${quotaPercent}%`,
                  backgroundColor:
                    quotaPercent > 85 ? colors.error : colors.accent,
                },
              ]}
            />
          </View>
          <Text style={styles.quotaSubtext}>
            {quotaPercent >= 100
              ? '⚠️ Storage quota limit reached (507). Syncing will fail until quota frees up.'
              : `${quotaPercent}% of max photo upload capacity used.`}
          </Text>
        </View>

        {/* Queued Inspections List */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.cardSectionTitle}>
            Queued Inspections ({drafts.length})
          </Text>
          <TouchableOpacity onPress={loadSyncData}>
            <Text style={styles.refreshText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        ) : drafts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No inspection drafts queued in SQLite.</Text>
          </View>
        ) : (
          <FlashList
            data={drafts}
            renderItem={renderDraftItem}
            estimatedItemSize={80}
            keyExtractor={item => item.id}
          />
        )}
      </ScrollView>

      {/* Floating Action Button: "Sync Now" */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleManualSync}
        disabled={isSyncing}
        activeOpacity={0.8}>
        {isSyncing ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={styles.fabIcon}>☁️</Text>
            <Text style={styles.fabText}>Sync Now</Text>
          </>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default SyncCenter;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  dashboardCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaFraction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  gaugeBackground: {
    height: 12,
    backgroundColor: colors.background,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 6,
  },
  quotaSubtext: {
    fontSize: 12,
    color: colors.textMuted,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  listItem: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  listMain: {
    flex: 1,
    marginRight: 10,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 11,
    color: colors.error,
    marginTop: 4,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: colors.accent,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  fabText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
