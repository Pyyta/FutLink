import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LoadingScreen } from '../components/layout/LoadingScreen';
import { PageHeader } from '../components/layout/PageHeader';
import { ProfileForm } from '../components/profile/ProfileForm';
import { Button, useToast } from '../components/ui';
import { ChevronLeftIcon } from '../components/ui/icons';
import { useSession } from '../lib/auth/session-context';

export function EditProfilePage() {
  const { t } = useTranslation();
  const { user, updateProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  if (!user) return <LoadingScreen />;

  const returnToProfile = () => {
    navigate('/perfil', { replace: true });
  };

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={<ChevronLeftIcon size={16} />}
        className="-ml-2"
        onClick={returnToProfile}
      >
        {t('publicProfile.back')}
      </Button>

      <PageHeader
        title={t('editProfile.title')}
        subtitle={t('editProfile.subtitle')}
      />

      <ProfileForm
        defaultValues={{
          name: user.name ?? '',
          phone: user.phone ?? '',
          locality: user.locality ?? '',
          positionIds: user.positions.map((position) => position.id),
        }}
        submitLabel={t('editProfile.save')}
        onCancel={returnToProfile}
        onSubmit={async (values) => {
          const updated = await updateProfile(values);
          await queryClient.invalidateQueries({
            queryKey: ['public-profile', updated.id],
          });
          toast.success(t('editProfile.success'));
          returnToProfile();
        }}
      />
    </div>
  );
}
