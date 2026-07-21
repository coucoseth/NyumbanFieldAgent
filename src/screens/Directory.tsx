import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import Property from '../database/models/Property';
import Room from '../database/models/Room';
import colors from '../config/colors';
import { api } from '../services/api';

interface DirectoryProps {
  navigation: any;
}

const REGIONS = ['All', 'central', 'eastern', 'western', 'northern'];
const STATUSES = ['All', 'active', 'inactive', 'under_renovation'];

const Directory: React.FC<DirectoryProps> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingApi, setFetchingApi] = useState(false);

  // 200ms debounce for search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load properties from SQLite using WatermelonDB query
  const loadLocalProperties = useCallback(async () => {
    setLoading(true);
    try {
      const collection = database.get<Property>('properties');
      const conditions = [];

      if (selectedRegion !== 'All') {
        conditions.push(Q.where('region', selectedRegion));
      }
      if (selectedStatus !== 'All') {
        conditions.push(Q.where('status', selectedStatus));
      }
      if (debouncedSearch.trim()) {
        // WatermelonDB search
        conditions.push(Q.where('name', Q.like(`%${Q.sanitizeLikeString(debouncedSearch.trim())}%`)));
      }

      const results = await collection.query(...conditions).fetch();
      setProperties(results);

      // If database is completely empty, fetch initial batch from server API
      if (results.length === 0 && !debouncedSearch && selectedRegion === 'All' && selectedStatus === 'All') {
        fetchServerProperties();
      }
    } catch (error) {
      console.error('Error fetching local properties:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedRegion, selectedStatus]);

  useEffect(() => {
    loadLocalProperties();
  }, [loadLocalProperties]);

  // Sync / Fetch initial properties from /properties API into WatermelonDB
  const fetchServerProperties = async () => {
    setFetchingApi(true);
    try {
      const response = await api.get('/properties?limit=50');
      const remoteData = response.data?.data || [];

      await database.write(async () => {
        const propCollection = database.get<Property>('properties');
        const roomCollection = database.get<Room>('rooms');

        for (const item of remoteData) {
          let prop: Property | null = null;
          try {
            prop = await propCollection.find(item.id);
          } catch {
            // Not found locally
          }

          if (prop) {
            await prop.update(r => {
              r.name = item.name;
              r.address = item.address;
              r.unitCount = item.unit_count;
              r.region = item.region;
              r.lastInspectedAt = item.last_inspected_at;
              r.status = item.status;
              r.version = item.version;
            });
          } else {
            await propCollection.create(r => {
              r._raw.id = item.id;
              r.name = item.name;
              r.address = item.address;
              r.unitCount = item.unit_count;
              r.region = item.region;
              r.lastInspectedAt = item.last_inspected_at;
              r.status = item.status;
              r.version = item.version;
            });
          }
        }
      });

      // Reload local records
      loadLocalProperties();
    } catch (error) {
      console.log('Server property fetch skipped/offline:', error);
    } finally {
      setFetchingApi(false);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: Property }) => {
      const addressText = item.address || 'No Address Provided';
      const unitText = item.unitCount != null ? `${item.unitCount} units` : '0 units';
      const formattedDate = item.lastInspectedAt
        ? new Date(item.lastInspectedAt).toLocaleDateString()
        : 'Never';

      let statusColor = colors.active;
      if (item.status === 'under_renovation') statusColor = colors.pending;
      if (item.status === 'inactive') statusColor = colors.inactive;

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() =>
            navigation.navigate('PropertyDetailsScreen', { propertyId: item.id })
          }>
          <View style={styles.cardHeader}>
            <Text style={styles.propertyName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>

          <Text style={styles.addressText} numberOfLines={1}>
            📍 {addressText}
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.metaText}>Region: {item.region}</Text>
            <Text style={styles.metaText}>Units: {unitText}</Text>
            <Text style={styles.metaText}>Inspected: {formattedDate}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Property Directory</Text>
        <TouchableOpacity style={styles.syncBtn} onPress={fetchServerProperties} disabled={fetchingApi}>
          {fetchingApi ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.syncBtnText}>Sync API</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search properties by name..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Region Filter Chips */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Region:</Text>
        <FlashList
          horizontal
          data={REGIONS}
          estimatedItemSize={70}
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.chip,
                selectedRegion === item && styles.chipActive,
              ]}
              onPress={() => setSelectedRegion(item)}>
              <Text
                style={[
                  styles.chipText,
                  selectedRegion === item && styles.chipTextActive,
                ]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Status Filter Chips */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Status:</Text>
        <FlashList
          horizontal
          data={STATUSES}
          estimatedItemSize={90}
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.chip,
                selectedStatus === item && styles.chipActive,
              ]}
              onPress={() => setSelectedStatus(item)}>
              <Text
                style={[
                  styles.chipText,
                  selectedStatus === item && styles.chipTextActive,
                ]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* List view */}
      <View style={styles.listContainer}>
        {loading && properties.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlashList
            data={properties}
            renderItem={renderItem}
            estimatedItemSize={120}
            keyExtractor={item => item.id}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No properties found matching your criteria.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

export default Directory;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  syncBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  syncBtnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 13,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 4,
    height: 38,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginRight: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
  },
  addressText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
