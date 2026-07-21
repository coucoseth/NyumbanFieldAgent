import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import InspectionDraft from '../database/models/InspectionDraft';
import DraftRoom from '../database/models/DraftRoom';
import Room from '../database/models/Room';
import LocalPhoto from '../database/models/LocalPhoto';
import colors from '../config/colors';
import syncQueueManager from '../services/sync/SyncQueueManager';

// Debounce helper utility for uncontrolled direct SQLite saves
function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

interface InspectionProps {
  route: any;
  navigation: any;
}

const CONDITIONS = ['Good', 'Fair', 'Poor'];

const Inspection: React.FC<InspectionProps> = ({ route, navigation }) => {
  const draftId = route.params?.draftId;

  const [draft, setDraft] = useState<InspectionDraft | null>(null);
  const [draftRooms, setDraftRooms] = useState<DraftRoom[]>([]);
  const [roomLabels, setRoomLabels] = useState<{ [key: string]: string }>({});
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);
  const [photosMap, setPhotosMap] = useState<{ [draftRoomId: string]: LocalPhoto[] }>({});
  const [loading, setLoading] = useState(true);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    loadDraftData();
  }, [draftId]);

  const loadDraftData = async () => {
    if (!draftId) return;
    setLoading(true);
    try {
      const draftsCollection = database.get<InspectionDraft>('inspection_drafts');
      const draftRecord = await draftsCollection.find(draftId);
      setDraft(draftRecord);

      const dRoomsCollection = database.get<DraftRoom>('draft_rooms');
      const dRooms = await dRoomsCollection
        .query(Q.where('draft_id', draftId))
        .fetch();
      setDraftRooms(dRooms);

      // Load Room labels
      const roomsCollection = database.get<Room>('rooms');
      const labels: { [key: string]: string } = {};
      const photos: { [draftRoomId: string]: LocalPhoto[] } = {};

      for (const dr of dRooms) {
        try {
          const roomObj = await roomsCollection.find(dr.roomId);
          labels[dr.id] = roomObj.label;
        } catch {
          labels[dr.id] = `Room ${dr.roomId}`;
        }

        // Fetch local photos for each draft_room
        const pRecords = await database
          .get<LocalPhoto>('local_photos')
          .query(Q.where('draft_room_id', dr.id))
          .fetch();
        photos[dr.id] = pRecords;
      }

      setRoomLabels(labels);
      setPhotosMap(photos);
    } catch (error) {
      console.error('Error loading inspection draft:', error);
      Alert.alert('Error', 'Could not load active inspection draft.');
    } finally {
      setLoading(false);
    }
  };

  const activeDraftRoom = draftRooms[activeRoomIndex];

  // Uncontrolled notes update handler debounced at 150ms
  const handleNotesChange = useCallback(
    debounce((text: string) => {
      if (!activeDraftRoom) return;
      database.write(async () => {
        await activeDraftRoom.update(r => {
          r.notes = text;
        });
      });
    }, 150),
    [activeDraftRoom]
  );

  // Update room condition toggle
  const handleConditionChange = async (condition: string) => {
    if (!activeDraftRoom) return;
    await database.write(async () => {
      await activeDraftRoom.update(r => {
        r.condition = condition;
      });
    });
    // Force re-render
    setDraftRooms([...draftRooms]);
  };

  // Add a photo entry to the current room
  const handleAddPhoto = async () => {
    if (!activeDraftRoom) return;

    // Simulate capturing a file path (or connecting to native vision camera)
    const simulatedPhotoUri = `file:///data/user/0/com.nyumbanfieldagent/cache/photo_${Date.now()}.jpg`;

    await database.write(async () => {
      const photosCollection = database.get<LocalPhoto>('local_photos');
      await photosCollection.create(record => {
        record.draftRoomId = activeDraftRoom.id;
        record.localUri = simulatedPhotoUri;
        record.syncStatus = 'pending';
      });
    });

    // Refresh photos map for active draft room
    const pRecords = await database
      .get<LocalPhoto>('local_photos')
      .query(Q.where('draft_room_id', activeDraftRoom.id))
      .fetch();

    setPhotosMap(prev => ({ ...prev, [activeDraftRoom.id]: pRecords }));
  };

  // Finalize inspection -> mark status = pending_sync -> trigger SyncQueueManager
  const handleFinalizeInspection = async () => {
    if (!draft) return;

    Alert.alert(
      'Finalize Inspection',
      'Are you sure you want to finalize and queue this inspection for syncing?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize & Sync',
          onPress: async () => {
            await database.write(async () => {
              await draft.update(r => {
                r.syncStatus = 'pending_sync';
                r.completedAt = Math.floor(Date.now() / 1000);
              });
            });

            // Trigger outbox queue manager asynchronously
            syncQueueManager.processQueue();

            // Navigate to SyncCenter or Home
            navigation.navigate('SyncCenter');
          },
        },
      ]
    );
  };

  if (loading || !draft || draftRooms.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const currentPhotos = activeDraftRoom ? photosMap[activeDraftRoom.id] || [] : [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Inspection</Text>
      </View>

      {/* Horizontal Room Selector Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {draftRooms.map((dr, index) => (
            <TouchableOpacity
              key={dr.id}
              style={[
                styles.tabItem,
                index === activeRoomIndex && styles.tabItemActive,
              ]}
              onPress={() => setActiveRoomIndex(index)}>
              <Text
                style={[
                  styles.tabText,
                  index === activeRoomIndex && styles.tabTextActive,
                ]}>
                {roomLabels[dr.id] || `Room ${index + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.formContent}>
        {/* Room Header */}
        <Text style={styles.roomTitle}>
          {roomLabels[activeDraftRoom.id] || 'Room Inspection'}
        </Text>

        {/* Condition Toggles */}
        <Text style={styles.fieldLabel}>Condition Assessment</Text>
        <View style={styles.segmentedControl}>
          {CONDITIONS.map(cond => {
            const isSelected = activeDraftRoom.condition === cond;
            return (
              <TouchableOpacity
                key={cond}
                style={[
                  styles.segmentBtn,
                  isSelected && styles.segmentBtnActive,
                ]}
                onPress={() => handleConditionChange(cond)}>
                <Text
                  style={[
                    styles.segmentText,
                    isSelected && styles.segmentTextActive,
                  ]}>
                  {cond}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Uncontrolled Notes Field */}
        <Text style={styles.fieldLabel}>Field Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Record notes on walls, flooring, fixtures, or defects..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          defaultValue={activeDraftRoom.notes || ''}
          onChangeText={handleNotesChange}
        />

        {/* Camera Grid */}
        <Text style={styles.fieldLabel}>Photo Evidence ({currentPhotos.length})</Text>
        <View style={styles.photoGrid}>
          <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhoto}>
            <Text style={styles.addPhotoIcon}>📷</Text>
            <Text style={styles.addPhotoText}>Add Photo</Text>
          </TouchableOpacity>

          {currentPhotos.map(photo => (
            <TouchableOpacity
              key={photo.id}
              style={styles.thumbnailWrapper}
              onPress={() => setPreviewPhotoUri(photo.localUri)}>
              <Image
                source={{ uri: photo.localUri }}
                style={styles.thumbnail}
                defaultSource={require('../assets/logo.png')}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* CTA Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalizeInspection}>
          <Text style={styles.finalizeBtnText}>Finalize Inspection</Text>
        </TouchableOpacity>
      </View>

      {/* Photo Preview Modal */}
      <Modal visible={!!previewPhotoUri} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.closeModalBtn}
            onPress={() => setPreviewPhotoUri(null)}>
            <Text style={styles.closeModalText}>✕ Close</Text>
          </TouchableOpacity>
          {previewPhotoUri && (
            <Image
              source={{ uri: previewPhotoUri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Inspection;

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
  },
  tabsContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    marginRight: 8,
  },
  tabItemActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  formContent: {
    padding: 16,
    paddingBottom: 100,
  },
  roomTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  segmentTextActive: {
    color: colors.white,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: 16,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginRight: 10,
    marginBottom: 10,
  },
  addPhotoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  addPhotoText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  thumbnailWrapper: {
    width: 90,
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: colors.border,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
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
  finalizeBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finalizeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  closeModalText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  fullImage: {
    width: '90%',
    height: '80%',
  },
});
