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
import Property from '../database/models/Property';
import Room from '../database/models/Room';
import InspectionDraft from '../database/models/InspectionDraft';
import DraftRoom from '../database/models/DraftRoom';
import colors from '../config/colors';
import { api } from '../services/api';

interface PropertyDetailProps {
  route: any;
  navigation: any;
}

const PropertyDetail: React.FC<PropertyDetailProps> = ({ route, navigation }) => {
  const propertyId = route.params?.propertyId;
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingInspection, setStartingInspection] = useState(false);

  useEffect(() => {
    loadPropertyData();
  }, [propertyId]);

  const loadPropertyData = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const propCollection = database.get<Property>('properties');
      const propRecord = await propCollection.find(propertyId);
      setProperty(propRecord);

      // Query rooms
      const roomCollection = database.get<Room>('rooms');
      let roomRecords = await roomCollection
        .query(Q.where('property_id', propertyId))
        .fetch();

      // If no rooms exist locally, fetch from /properties/:id endpoint
      if (roomRecords.length === 0) {
        try {
          const response = await api.get(`/properties/${propertyId}`);
          const apiRooms = response.data?.rooms || [];

          if (apiRooms.length > 0) {
            await database.write(async () => {
              for (const r of apiRooms) {
                await roomCollection.create(record => {
                  record._raw.id = r.id;
                  record.propertyId = propertyId;
                  record.label = r.label;
                  record.floor = r.floor;
                });
              }
            });

            roomRecords = await roomCollection
              .query(Q.where('property_id', propertyId))
              .fetch();
          }
        } catch (apiErr) {
          console.log('Skipped API room fetch:', apiErr);
        }
      }

      setRooms(roomRecords);
    } catch (error) {
      console.error('Error loading property detail:', error);
      Alert.alert('Error', 'Could not load property details.');
    } finally {
      setLoading(false);
    }
  };

  const handleBeginInspection = async () => {
    if (!property) return;
    setStartingInspection(true);

    try {
      let draftId = '';

      await database.write(async () => {
        const draftsCollection = database.get<InspectionDraft>('inspection_drafts');
        const draftRoomsCollection = database.get<DraftRoom>('draft_rooms');

        // Create new inspection draft mapped to property's latest version
        const newDraft = await draftsCollection.create(record => {
          record.propertyId = property.id;
          record.propertyVersion = property.version;
          record.type = 'routine';
          record.completedAt = Math.floor(Date.now() / 1000);
          record.syncStatus = 'pending_sync';
        });

        draftId = newDraft.id;

        // Create associated draft_rooms for each room
        for (const room of rooms) {
          await draftRoomsCollection.create(record => {
            record.draftId = newDraft.id;
            record.roomId = room.id;
            record.condition = 'Good';
            record.notes = '';
          });
        }
      });

      // Navigate to active Inspection form
      navigation.navigate('Inspection', { draftId });
    } catch (error: any) {
      console.error('Error starting inspection:', error);
      Alert.alert('Error', 'Failed to create inspection draft.');
    } finally {
      setStartingInspection(false);
    }
  };

  if (loading || !property) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const addressText = property.address || 'No Address Provided';
  const unitText = property.unitCount != null ? `${property.unitCount} units` : '0 units';
  const formattedDate = property.lastInspectedAt
    ? new Date(property.lastInspectedAt).toLocaleString()
    : 'Never Inspected';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {property.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Property Card */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.propertyName}>{property.name}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{property.status}</Text>
            </View>
          </View>

          <Text style={styles.address}>📍 {addressText}</Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Region</Text>
              <Text style={styles.metaValue}>{property.region}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Total Units</Text>
              <Text style={styles.metaValue}>{unitText}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Server Version</Text>
              <Text style={styles.metaValue}>v{property.version}</Text>
            </View>
          </View>

          <View style={styles.inspectionDateRow}>
            <Text style={styles.metaLabel}>Last Inspected:</Text>
            <Text style={styles.metaValue}>{formattedDate}</Text>
          </View>
        </View>

        {/* Rooms Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Rooms ({rooms.length})</Text>

          {rooms.length === 0 ? (
            <Text style={styles.emptyRoomsText}>No rooms registered for this property.</Text>
          ) : (
            rooms.map(room => (
              <View key={room.id} style={styles.roomCard}>
                <Text style={styles.roomLabel}>{room.label}</Text>
                <Text style={styles.roomFloor}>Floor {room.floor}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* CTA Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleBeginInspection}
          disabled={startingInspection}
          activeOpacity={0.8}>
          {startingInspection ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.ctaButtonText}>Begin Inspection</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default PropertyDetail;

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
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    paddingRight: 12,
  },
  backBtnText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: colors.active,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
  },
  address: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 16,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    marginBottom: 12,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  inspectionDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12,
  },
  emptyRoomsText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  roomCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  roomFloor: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ctaButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});
