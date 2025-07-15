import {Text, TouchableOpacity, Image, Platform, View} from 'react-native'
import {MenuItem} from "@/type";
import {appwriteConfig} from "@/lib/appwrite";
import {useCartStore} from "@/store/cart.store";
import { useState } from 'react';

const MenuCard = ({ item: { $id, image_url, name, price }}: { item: MenuItem}) => {
    const { addItem } = useCartStore();
    const [imageError, setImageError] = useState(false);

    // Smart image URL handler
    const getImageUrl = (url: string): string => {
        if (!url) return '';

        // If it's already a full HTTP URL (external image or already processed)
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        // If it's an Appwrite file view URL that needs project ID
        if (url.includes('/storage/buckets/')) {
            return `${url}?project=${appwriteConfig.projectId}`;
        }

        // If it's just a file ID, construct the full URL
        if (url.length > 0 && !url.includes('/')) {
            return `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.bucketId}/files/${url}/view?project=${appwriteConfig.projectId}`;
        }

        // Fallback: assume it's already a properly formatted URL
        return `${url}?project=${appwriteConfig.projectId}`;
    };

    const imageUrl = getImageUrl(image_url);

    const handleImageError = () => {
        setImageError(true);
    };

    return (
        <TouchableOpacity className="menu-card" style={Platform.OS === 'android' ? { elevation: 10, shadowColor: '#878787'}: {}}>
            {/* Image with error handling */}
            {imageUrl && !imageError ? (
                <Image
                    source={{ uri: imageUrl }}
                    className="size-32 absolute -top-10"
                    resizeMode="contain"
                    onError={handleImageError}
                />
            ) : (
                <View className="size-32 absolute -top-10 bg-gray-200 flex items-center justify-center rounded-lg">
                    <Text className="text-gray-500 text-xs">🍕</Text>
                </View>
            )}

            <Text className="text-center base-bold text-dark-100 mb-2" numberOfLines={1}>{name}</Text>
            <Text className="body-regular text-gray-200 mb-4">From ${price}</Text>
            <TouchableOpacity onPress={() => addItem({ id: $id, name, price, image_url: imageUrl, customizations: []})}>
                <Text className="paragraph-bold text-primary">Add to Cart +</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    )
}

export default MenuCard